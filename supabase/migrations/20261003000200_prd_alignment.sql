-- Align schema with the PRD: plans, lead source, per-role lead visibility,
-- messages (unified inbox) and automations.

-- Organizations: plan + display fields
alter table public.organizations
  add column plan text not null default 'Starter' check (plan in ('Starter', 'Pro', 'Business')),
  add column domain text,
  add column color text;

-- Leads: source channel, creator defaults to the caller
alter table public.leads add column source text;
alter table public.leads alter column created_by set default auth.uid();

-- Profiles: keep the email next to the name so teammates can be listed
alter table public.profiles add column email text;
update public.profiles p set email = u.email from auth.users u where u.id = p.id;

create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url', new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

-- Caller's role in an org (null when not a member)
create or replace function private.org_role(_org uuid)
returns public.member_role language sql stable security definer set search_path = ''
as $$
  select m.role from public.memberships m
  where m.org_id = _org and m.user_id = (select auth.uid());
$$;
grant execute on function private.org_role(uuid) to authenticated;

-- Leads: admins and viewers see the whole org, agents only their own leads.
-- Viewers are read-only.
alter policy "leads_select_member" on public.leads
  using (
    private.org_role(org_id) in ('admin', 'viewer')
    or (
      private.org_role(org_id) = 'agent'
      and (assignee_id = (select auth.uid()) or created_by = (select auth.uid()))
    )
  );
alter policy "leads_select_member" on public.leads rename to "leads_select";

alter policy "leads_insert_member" on public.leads
  with check (
    private.org_role(org_id) = 'admin'
    or (private.org_role(org_id) = 'agent' and coalesce(assignee_id, (select auth.uid())) = (select auth.uid()))
  );
alter policy "leads_insert_member" on public.leads rename to "leads_insert";

alter policy "leads_update_member" on public.leads
  using (
    private.org_role(org_id) = 'admin'
    or (private.org_role(org_id) = 'agent' and assignee_id = (select auth.uid()))
  )
  with check (
    private.org_role(org_id) = 'admin'
    or (private.org_role(org_id) = 'agent' and assignee_id = (select auth.uid()))
  );
alter policy "leads_update_member" on public.leads rename to "leads_update";

-- Unified inbox: one row per message on a lead, any channel
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'sms', 'email', 'instagram', 'facebook', 'web_form', 'note')),
  direction text not null check (direction in ('inbound', 'outbound')),
  content text not null,
  sender_id uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index messages_lead_idx on public.messages (lead_id, created_at);
create index messages_org_idx on public.messages (org_id, created_at desc);

alter table public.messages enable row level security;

-- A message is visible to whoever can see its lead (leads RLS applies in the subquery)
create policy "messages_select" on public.messages for select to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id and l.org_id = messages.org_id));
create policy "messages_insert" on public.messages for insert to authenticated
  with check (
    private.org_role(org_id) in ('admin', 'agent')
    and exists (select 1 from public.leads l where l.id = lead_id and l.org_id = messages.org_id)
  );
create policy "messages_delete_admin" on public.messages for delete to authenticated
  using (private.org_role(org_id) = 'admin');

-- Automations: trigger -> action rules per org
create table public.automations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  trigger_event text not null check (trigger_event in ('lead_created', 'stage_changed', 'appointment_booked', 'message_received')),
  action_type text not null check (action_type in ('send_whatsapp', 'send_sms', 'send_email', 'assign_round_robin', 'add_tag', 'stop_followup')),
  config jsonb not null default '{}',
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index automations_org_idx on public.automations (org_id);

alter table public.automations enable row level security;

create policy "automations_select_member" on public.automations for select to authenticated
  using (private.is_org_member(org_id));
create policy "automations_admin_write" on public.automations for all to authenticated
  using (private.org_role(org_id) = 'admin')
  with check (private.org_role(org_id) = 'admin');

alter publication supabase_realtime add table public.messages;
