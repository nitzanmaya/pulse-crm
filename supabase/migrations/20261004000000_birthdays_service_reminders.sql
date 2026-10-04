-- Customer birthdays and recurring (e.g. annual) service reminders.
-- A daily job (Vercel cron -> /api/cron/reminders) calls claim_due_reminders
-- with a shared secret; the function returns what to send and logs it so
-- nothing is sent twice.

alter table public.leads
  add column birthday date,
  add column service_interval_months smallint check (service_interval_months between 1 and 60),
  add column last_service_at date;

alter table public.organizations
  add column auto_birthday_email boolean not null default true,
  add column auto_service_reminder boolean not null default true;

-- One row per email the system sent (or claimed to send) for a lead
create table public.reminder_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  lead_id uuid not null references public.leads (id) on delete cascade,
  kind text not null check (kind in ('birthday', 'service')),
  sent_for date not null,
  created_at timestamptz not null default now(),
  unique (lead_id, kind, sent_for)
);
create index reminder_log_org_idx on public.reminder_log (org_id, created_at desc);

alter table public.reminder_log enable row level security;
create policy "reminder_log_select_member" on public.reminder_log for select to authenticated
  using (private.is_org_member(org_id));

-- Shared secret for the cron caller (stored as a sha256 hex digest)
create table private.app_settings (
  key text primary key,
  value text not null
);

create or replace function public.claim_due_reminders(_secret text)
returns table (
  kind text,
  lead_id uuid,
  email text,
  contact_name text,
  lead_title text,
  org_name text,
  due date
)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  _today date := (now() at time zone 'Asia/Jerusalem')::date;
  _leap boolean := extract(day from (date_trunc('year', _today) + interval '2 months - 1 day')) = 29;
begin
  if encode(sha256(convert_to(coalesce(_secret, ''), 'UTF8')), 'hex')
     is distinct from (select s.value from private.app_settings s where s.key = 'cron_secret_sha256') then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return query
  with birthdays as (
    select 'birthday'::text as kind, l.id as lead_id, l.org_id, l.email, l.contact_name, l.title, o.name as org_name, _today as due
    from public.leads l
    join public.organizations o on o.id = l.org_id
    where o.auto_birthday_email
      and l.birthday is not null
      and coalesce(l.email, '') <> ''
      and (
        (extract(month from l.birthday) = extract(month from _today) and extract(day from l.birthday) = extract(day from _today))
        -- Feb 29 birthdays are greeted on Feb 28 in non-leap years
        or (not _leap and extract(month from l.birthday) = 2 and extract(day from l.birthday) = 29
            and extract(month from _today) = 2 and extract(day from _today) = 28)
      )
  ),
  services as (
    select 'service'::text, l.id, l.org_id, l.email, l.contact_name, l.title, o.name,
           (l.last_service_at + make_interval(months => l.service_interval_months))::date
    from public.leads l
    join public.organizations o on o.id = l.org_id
    where o.auto_service_reminder
      and l.stage <> 'lost'
      and l.service_interval_months is not null
      and l.last_service_at is not null
      and coalesce(l.email, '') <> ''
      -- remind from a week before the due date (once per due date)
      and (l.last_service_at + make_interval(months => l.service_interval_months))::date - 7 <= _today
  ),
  due_items as (
    select * from birthdays
    union all
    select * from services
  ),
  claimed as (
    insert into public.reminder_log (org_id, lead_id, kind, sent_for)
    select d.org_id, d.lead_id, d.kind, d.due from due_items d
    on conflict (lead_id, kind, sent_for) do nothing
    returning reminder_log.lead_id, reminder_log.kind
  ),
  logged as (
    insert into public.messages (org_id, lead_id, channel, direction, content, sender_id)
    select d.org_id, d.lead_id, 'email', 'outbound',
           case d.kind when 'birthday' then 'נשלחה ברכת יום הולדת אוטומטית'
                       else 'נשלחה תזכורת אוטומטית לשירות (מועד: ' || to_char(d.due, 'DD/MM/YYYY') || ')' end,
           null
    from due_items d join claimed c on c.lead_id = d.lead_id and c.kind = d.kind
    returning 1
  )
  select d.kind, d.lead_id, d.email, d.contact_name, d.title, d.org_name, d.due
  from due_items d join claimed c on c.lead_id = d.lead_id and c.kind = d.kind;
end;
$$;

grant execute on function public.claim_due_reminders(text) to anon, authenticated;
