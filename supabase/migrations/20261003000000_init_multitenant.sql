-- Pulse CRM: multi-tenant core schema
-- organizations -> memberships (admin/agent) -> leads (kanban stages)

create extension if not exists pgcrypto;

create type public.member_role as enum ('admin', 'agent');
create type public.lead_stage as enum ('new', 'in_progress', 'proposal', 'won');

-- Profiles (1:1 with auth.users)
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,48}$'),
  logo_url text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'agent',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role public.member_role not null default 'agent',
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references auth.users (id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);
create index invitations_org_id_idx on public.invitations (org_id);
create unique index invitations_pending_unique
  on public.invitations (org_id, lower(email)) where accepted_at is null;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  title text not null,
  company text,
  contact_name text,
  email text,
  phone text,
  value numeric(12, 2) not null default 0,
  currency text not null default 'ILS',
  stage public.lead_stage not null default 'new',
  position integer not null default 0,
  assignee_id uuid references auth.users (id) on delete set null,
  tags text[] not null default '{}',
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index leads_org_stage_idx on public.leads (org_id, stage, position);
create index leads_assignee_idx on public.leads (assignee_id);

-- Helpers live in a non-exposed schema and bypass RLS to avoid policy recursion
create schema if not exists private;

create or replace function private.is_org_member(_org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = _org and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_org_admin(_org uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.org_id = _org and m.user_id = (select auth.uid()) and m.role = 'admin'
  );
$$;

create or replace function private.shares_org_with(_user uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships a
    join public.memberships b on a.org_id = b.org_id
    where a.user_id = (select auth.uid()) and b.user_id = _user
  );
$$;

grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;

-- updated_at trigger
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end; $$;

create trigger leads_touch_updated_at before update on public.leads
  for each row execute function private.touch_updated_at();

-- Auto-create profile on sign-up
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- RPC: create an organization and become its admin
create or replace function public.create_organization(_name text, _slug text)
returns public.organizations
language plpgsql security definer set search_path = ''
as $$
declare
  _org public.organizations;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated';
  end if;
  insert into public.organizations (name, slug, created_by)
  values (_name, _slug, (select auth.uid()))
  returning * into _org;
  insert into public.memberships (org_id, user_id, role)
  values (_org.id, (select auth.uid()), 'admin');
  return _org;
end;
$$;

-- RPC: accept an invitation by token (email must match the signed-in user)
create or replace function public.accept_invitation(_token uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  _inv public.invitations;
  _email text;
begin
  select email into _email from auth.users where id = (select auth.uid());
  if _email is null then
    raise exception 'not authenticated';
  end if;

  select * into _inv from public.invitations
  where token = _token and accepted_at is null and expires_at > now()
  for update;

  if not found then
    raise exception 'invitation not found or expired';
  end if;
  if lower(_inv.email) <> lower(_email) then
    raise exception 'invitation was sent to a different email';
  end if;

  insert into public.memberships (org_id, user_id, role)
  values (_inv.org_id, (select auth.uid()), _inv.role)
  on conflict (org_id, user_id) do update set role = excluded.role;

  update public.invitations set accepted_at = now() where id = _inv.id;
  return _inv.org_id;
end;
$$;

revoke execute on function public.create_organization(text, text) from anon, public;
revoke execute on function public.accept_invitation(uuid) from anon, public;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.accept_invitation(uuid) to authenticated;

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.leads enable row level security;

-- profiles: see yourself and teammates, edit only yourself
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.shares_org_with(id));
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- organizations: members read, admins update/delete; creation via RPC
create policy "orgs_select_member" on public.organizations for select to authenticated
  using (private.is_org_member(id));
create policy "orgs_update_admin" on public.organizations for update to authenticated
  using (private.is_org_admin(id)) with check (private.is_org_admin(id));
create policy "orgs_delete_admin" on public.organizations for delete to authenticated
  using (private.is_org_admin(id));

-- memberships: members read roster, admins manage; anyone may leave
create policy "memberships_select" on public.memberships for select to authenticated
  using (private.is_org_member(org_id));
create policy "memberships_update_admin" on public.memberships for update to authenticated
  using (private.is_org_admin(org_id)) with check (private.is_org_admin(org_id));
create policy "memberships_delete" on public.memberships for delete to authenticated
  using (private.is_org_admin(org_id) or user_id = (select auth.uid()));

-- invitations: admins only (acceptance goes through RPC)
create policy "invitations_admin_all" on public.invitations for all to authenticated
  using (private.is_org_admin(org_id))
  with check (private.is_org_admin(org_id) and invited_by = (select auth.uid()));

-- leads: every member reads and works leads; only admins delete
create policy "leads_select_member" on public.leads for select to authenticated
  using (private.is_org_member(org_id));
create policy "leads_insert_member" on public.leads for insert to authenticated
  with check (private.is_org_member(org_id));
create policy "leads_update_member" on public.leads for update to authenticated
  using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
create policy "leads_delete_admin" on public.leads for delete to authenticated
  using (private.is_org_admin(org_id));

-- Realtime for the kanban board
alter publication supabase_realtime add table public.leads;
