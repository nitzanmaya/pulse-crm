-- Booking & availability, public booking page, notification automations and
-- Google Calendar sync-ready schema.
--
-- Flow: a customer books on /book/<org slug> (or the WhatsApp bot, or a team
-- member adds an appointment). Inserting an appointment enqueues
-- notification_jobs from the org's active automations (confirmation now,
-- reminder N hours before). The app sends due jobs through Resend / the
-- WhatsApp provider (claim_notification_jobs + finish_notification_jobs,
-- guarded by the same cron secret as claim_due_reminders).

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Organization booking settings
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column booking_enabled boolean not null default true,
  add column booking_headline text check (char_length(booking_headline) <= 160),
  add column booking_slot_minutes smallint not null default 30 check (booking_slot_minutes between 5 and 240),
  add column booking_buffer_minutes smallint not null default 0 check (booking_buffer_minutes between 0 and 240),
  add column booking_min_notice_hours smallint not null default 12 check (booking_min_notice_hours between 0 and 720),
  add column booking_max_days smallint not null default 30 check (booking_max_days between 1 and 365);

-- ---------------------------------------------------------------------------
-- Services: what customers can book
-- questions: [{ id, label, type: number|select|text, required, min, max,
--               options[], extra_minutes, extra_price }]
-- For number questions the base duration/price covers one unit; every extra
-- unit adds extra_minutes / extra_price.
-- ---------------------------------------------------------------------------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text check (char_length(description) <= 500),
  duration_minutes smallint not null default 60 check (duration_minutes between 5 and 720),
  price numeric(10, 2) not null default 0 check (price >= 0),
  color text not null default 'rose',
  questions jsonb not null default '[]' check (jsonb_typeof(questions) = 'array'),
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_org_idx on public.services (org_id, position);
create trigger services_touch_updated_at before update on public.services
  for each row execute function private.touch_updated_at();

-- Weekly opening hours (local time, Asia/Jerusalem); several ranges per day allowed
create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index availability_rules_org_idx on public.availability_rules (org_id, weekday);

-- Blocked days (holidays, vacation)
create table public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  reason text check (char_length(reason) <= 120),
  created_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index availability_blocks_org_idx on public.availability_blocks (org_id, starts_on);

-- ---------------------------------------------------------------------------
-- Google Calendar (sync-ready; OAuth + sync worker come later)
-- ---------------------------------------------------------------------------
create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null default auth.uid(),
  provider text not null default 'google' check (provider in ('google')),
  account_email text,
  calendar_id text not null default 'primary',
  sync_direction text not null default 'two_way' check (sync_direction in ('push', 'pull', 'two_way')),
  status text not null default 'pending' check (status in ('pending', 'active', 'error', 'revoked')),
  sync_token text,              -- Google incremental sync token (events.list nextSyncToken)
  watch_channel_id text,        -- push notification channel (events.watch)
  watch_resource_id text,
  watch_expires_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (org_id, provider, calendar_id)
);

-- OAuth tokens never leave the private schema
create table private.calendar_credentials (
  connection_id uuid primary key references public.calendar_connections (id) on delete cascade,
  refresh_token text not null,
  access_token text,
  expires_at timestamptz
);

-- Busy times pulled from the external calendar; booking slots avoid them
create table public.external_busy (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  connection_id uuid not null references public.calendar_connections (id) on delete cascade,
  external_event_id text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  unique (connection_id, external_event_id),
  check (ends_at > starts_at)
);
create index external_busy_org_idx on public.external_busy (org_id, starts_at);

-- ---------------------------------------------------------------------------
-- Appointments
-- ---------------------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  service_id uuid references public.services (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  assignee_id uuid references auth.users (id) on delete set null,
  customer_name text not null check (char_length(customer_name) between 1 and 120),
  phone text check (char_length(phone) <= 32),
  email text check (char_length(email) <= 254),
  address text check (char_length(address) <= 300),
  notes text check (char_length(notes) <= 1000),
  answers jsonb not null default '{}' check (jsonb_typeof(answers) = 'object'),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price numeric(10, 2) not null default 0,
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'completed', 'cancelled', 'no_show')),
  source text not null default 'manual' check (source in ('booking_page', 'whatsapp_bot', 'manual')),
  google_event_id text,
  sync_status text not null default 'none' check (sync_status in ('none', 'pending', 'synced', 'error')),
  synced_at timestamptz,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- No double booking (the race-proof guard behind the slot check)
  constraint appointments_no_overlap exclude using gist (
    org_id with =, tstzrange(starts_at, ends_at) with &&
  ) where (status in ('pending', 'confirmed'))
);
create index appointments_org_start_idx on public.appointments (org_id, starts_at);
create index appointments_lead_idx on public.appointments (lead_id);
create trigger appointments_touch_updated_at before update on public.appointments
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Automations: stable keys for the built-in booking rules
-- config: { kind: confirmation|reminder, offset_hours, template, subject }
-- ---------------------------------------------------------------------------
alter table public.automations add column key text;
create unique index automations_org_key_idx on public.automations (org_id, key) where key is not null;

-- Outbox: one row per message to send for an appointment
create table public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  automation_id uuid references public.automations (id) on delete set null,
  channel text not null check (channel in ('whatsapp', 'email')),
  kind text not null check (kind in ('confirmation', 'reminder')),
  send_at timestamptz not null,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'simulated', 'failed', 'skipped')),
  attempts smallint not null default 0,
  provider text,
  provider_message_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (appointment_id, channel, kind)
);
create index notification_jobs_due_idx on public.notification_jobs (send_at) where status = 'queued';
create index notification_jobs_org_idx on public.notification_jobs (org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Defaults for every organization: Sun-Thu 08:00-18:00, Fri 08:00-13:00 and
-- the three booking automations
-- ---------------------------------------------------------------------------
create or replace function private.seed_booking_defaults(_org uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.availability_rules where org_id = _org) then
    insert into public.availability_rules (org_id, weekday, start_time, end_time)
    select _org, d, '08:00', case when d = 5 then '13:00'::time else '18:00'::time end
    from generate_series(0, 5) d;
  end if;

  insert into public.automations (org_id, key, name, trigger_event, action_type, config, is_active, created_by)
  values
    (_org, 'booking_confirm_whatsapp', 'אישור תור ב-WhatsApp', 'appointment_booked', 'send_whatsapp',
     jsonb_build_object('kind', 'confirmation', 'template',
       E'היי {{name}} 👋\nהתור שלך ל{{service}} נקבע ל{{date}} בשעה {{time}}.\nכתובת: {{address}}\nנתראה! {{business}}'), true, null),
    (_org, 'booking_confirm_email', 'אישור תור במייל', 'appointment_booked', 'send_email',
     jsonb_build_object('kind', 'confirmation', 'subject', 'התור שלך ל{{service}} אושר ✓', 'template',
       E'שלום {{name}},\nהתור שלך ל{{service}} נקבע ל{{date}} בשעה {{time}}.\nכתובת: {{address}}\n\nאם משהו משתנה, פשוט השיבו למייל הזה.'), true, null),
    (_org, 'booking_reminder_whatsapp', 'תזכורת WhatsApp לפני הביקור', 'appointment_booked', 'send_whatsapp',
     jsonb_build_object('kind', 'reminder', 'offset_hours', 24, 'template',
       E'תזכורת 🔔 {{name}}, מחר ({{date}}) בשעה {{time}} מגיעים אליך ל{{service}}.\nכתובת: {{address}}\nצריך לשנות? השב/י להודעה הזו.'), true, null)
  on conflict (org_id, key) where key is not null do nothing;
end;
$$;

create or replace function private.on_org_created()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin perform private.seed_booking_defaults(new.id); return new; end; $$;

create trigger organizations_seed_booking after insert on public.organizations
  for each row execute function private.on_org_created();

do $$ begin perform private.seed_booking_defaults(id) from public.organizations; end $$;

-- ---------------------------------------------------------------------------
-- Appointment side effects: enqueue notifications, keep reminders in step,
-- mark for calendar sync, record completed service on the lead
-- ---------------------------------------------------------------------------
create or replace function private.appointment_before_write()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.calendar_connections c where c.org_id = new.org_id and c.status = 'active')
     and (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
          or new.status is distinct from old.status) then
    new.sync_status := 'pending';
  end if;
  return new;
end;
$$;

create trigger appointments_before_write before insert or update on public.appointments
  for each row execute function private.appointment_before_write();

create or replace function private.appointment_after_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status not in ('pending', 'confirmed') then return new; end if;

  insert into public.notification_jobs (org_id, appointment_id, automation_id, channel, kind, send_at, status)
  select new.org_id, new.id, a.id, j.channel, j.kind, j.send_at,
         case
           when j.channel = 'whatsapp' and coalesce(new.phone, '') = '' then 'skipped'
           when j.channel = 'email' and coalesce(new.email, '') = '' then 'skipped'
           -- booked too close to the visit: the confirmation already covers it
           when j.kind = 'reminder' and j.send_at <= now() then 'skipped'
           else 'queued'
         end
  from public.automations a
  cross join lateral (
    select case a.action_type when 'send_whatsapp' then 'whatsapp' else 'email' end as channel,
           coalesce(a.config ->> 'kind', 'confirmation') as kind,
           case when a.config ->> 'kind' = 'reminder'
                then new.starts_at - make_interval(hours => coalesce((a.config ->> 'offset_hours')::int, 24))
                else now() end as send_at
  ) j
  where a.org_id = new.org_id and a.is_active
    and a.trigger_event = 'appointment_booked'
    and a.action_type in ('send_whatsapp', 'send_email')
  on conflict (appointment_id, channel, kind) do nothing;

  return new;
end;
$$;

create trigger appointments_after_insert after insert on public.appointments
  for each row execute function private.appointment_after_insert();

create or replace function private.appointment_after_update()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status in ('cancelled', 'no_show', 'completed') and old.status in ('pending', 'confirmed') then
    update public.notification_jobs set status = 'skipped'
    where appointment_id = new.id and status = 'queued' and kind = 'reminder';
  elsif new.starts_at is distinct from old.starts_at then
    update public.notification_jobs j
    set send_at = new.starts_at - make_interval(hours => coalesce((a.config ->> 'offset_hours')::int, 24)),
        status = case when new.starts_at - make_interval(hours => coalesce((a.config ->> 'offset_hours')::int, 24)) <= now()
                      then 'skipped' else 'queued' end
    from public.automations a
    where j.appointment_id = new.id and j.kind = 'reminder' and j.status in ('queued', 'skipped')
      and a.id = j.automation_id;
  end if;

  if new.status = 'completed' and old.status <> 'completed' and new.lead_id is not null then
    update public.leads set last_service_at = (new.starts_at at time zone 'Asia/Jerusalem')::date
    where id = new.lead_id
      and (last_service_at is null or last_service_at < (new.starts_at at time zone 'Asia/Jerusalem')::date);
  end if;
  return new;
end;
$$;

create trigger appointments_after_update after update on public.appointments
  for each row execute function private.appointment_after_update();

-- ---------------------------------------------------------------------------
-- Pricing / duration for a service given the customer's answers
-- ---------------------------------------------------------------------------
create or replace function private.service_quote(_service uuid, _answers jsonb)
returns table (minutes int, price numeric)
language sql stable security definer set search_path = ''
as $$
  with s as (select * from public.services where id = _service),
  units as (
    select coalesce((q ->> 'extra_minutes')::int, 0) as xm,
           coalesce((q ->> 'extra_price')::numeric, 0) as xp,
           greatest(
             least(
               case when coalesce(_answers ->> (q ->> 'id'), '') ~ '^[0-9]{1,3}$' then (_answers ->> (q ->> 'id'))::int else 1 end,
               coalesce((q ->> 'max')::int, 50)
             ) - 1, 0) as extra_units
    from s, jsonb_array_elements(s.questions) q
    where q ->> 'type' = 'number'
  )
  select (s.duration_minutes + coalesce((select sum(xm * extra_units) from units), 0))::int,
         s.price + coalesce((select sum(xp * extra_units) from units), 0)
  from s;
$$;

-- ---------------------------------------------------------------------------
-- Public booking API (anon): page data, free slots, book
-- ---------------------------------------------------------------------------
create or replace function public.get_booking_page(_slug text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'org', jsonb_build_object('name', o.name, 'slug', o.slug, 'headline', o.booking_headline,
                              'max_days', o.booking_max_days),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description, 'duration_minutes', s.duration_minutes,
        'price', s.price, 'color', s.color, 'questions', s.questions) order by s.position, s.created_at)
      from public.services s where s.org_id = o.id and s.is_active
    ), '[]'::jsonb)
  )
  from public.organizations o
  where o.slug = _slug and o.booking_enabled;
$$;

create or replace function public.get_booking_slots(
  _slug text, _service uuid, _answers jsonb default '{}', _from date default null, _days int default 14
)
returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
  _tz constant text := 'Asia/Jerusalem';
  _org public.organizations;
  _minutes int;
  _today date := (now() at time zone _tz)::date;
  _start date;
  _end date;
begin
  select * into _org from public.organizations o where o.slug = _slug and o.booking_enabled;
  if not found then raise exception 'booking page not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.services s where s.id = _service and s.org_id = _org.id and s.is_active) then
    raise exception 'service not found' using errcode = 'P0002';
  end if;

  select q.minutes into _minutes from private.service_quote(_service, coalesce(_answers, '{}')) q;
  _start := greatest(coalesce(_from, _today), _today);
  _end := least(_start + least(greatest(coalesce(_days, 14), 1), 62) - 1, _today + _org.booking_max_days);

  return query
  with days as (
    select d::date as day from generate_series(_start, _end, interval '1 day') d
  ),
  windows as (
    select (dy.day + r.start_time) at time zone _tz as w_start,
           (dy.day + r.end_time) at time zone _tz as w_end
    from days dy
    join public.availability_rules r on r.org_id = _org.id and r.weekday = extract(dow from dy.day)::int
    where not exists (
      select 1 from public.availability_blocks b
      where b.org_id = _org.id and dy.day between b.starts_on and b.ends_on
    )
  ),
  candidates as (
    select g as c_start, g + make_interval(mins => _minutes) as c_end
    from windows w,
         generate_series(w.w_start, w.w_end - make_interval(mins => _minutes), make_interval(mins => _org.booking_slot_minutes)) g
  )
  select distinct c.c_start, c.c_end
  from candidates c
  where c.c_start >= now() + make_interval(hours => _org.booking_min_notice_hours)
    and not exists (
      select 1 from public.appointments a
      where a.org_id = _org.id and a.status in ('pending', 'confirmed')
        and tstzrange(a.starts_at - make_interval(mins => _org.booking_buffer_minutes),
                      a.ends_at + make_interval(mins => _org.booking_buffer_minutes))
            && tstzrange(c.c_start, c.c_end)
    )
    and not exists (
      select 1 from public.external_busy e
      where e.org_id = _org.id and tstzrange(e.starts_at, e.ends_at) && tstzrange(c.c_start, c.c_end)
    )
  order by c.c_start;
end;
$$;

create or replace function public.book_appointment(
  _slug text,
  _service uuid,
  _starts_at timestamptz,
  _answers jsonb,
  _name text,
  _phone text,
  _email text default null,
  _address text default null,
  _notes text default null,
  _source text default 'booking_page'
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  _tz constant text := 'Asia/Jerusalem';
  _org public.organizations;
  _svc public.services;
  _quote record;
  _phone_digits text := regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g');
  _lead uuid;
  _appt public.appointments;
  _q jsonb;
begin
  select * into _org from public.organizations o where o.slug = _slug and o.booking_enabled;
  if not found then raise exception 'booking page not found' using errcode = 'P0002'; end if;
  select * into _svc from public.services s where s.id = _service and s.org_id = _org.id and s.is_active;
  if not found then raise exception 'service not found' using errcode = 'P0002'; end if;

  _name := btrim(coalesce(_name, ''));
  if char_length(_name) < 2 or char_length(_name) > 120 then raise exception 'invalid name' using errcode = '22023'; end if;
  if char_length(_phone_digits) not between 9 and 15 then raise exception 'invalid phone' using errcode = '22023'; end if;
  if coalesce(_email, '') <> '' and _email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email' using errcode = '22023'; end if;
  if _source not in ('booking_page', 'whatsapp_bot') then _source := 'booking_page'; end if;
  _answers := coalesce(_answers, '{}');
  if jsonb_typeof(_answers) <> 'object' or char_length(_answers::text) > 2000 then raise exception 'invalid answers' using errcode = '22023'; end if;

  for _q in select * from jsonb_array_elements(_svc.questions) loop
    if coalesce((_q ->> 'required')::boolean, false) and coalesce(btrim(_answers ->> (_q ->> 'id')), '') = '' then
      raise exception 'missing answer: %', _q ->> 'label' using errcode = '22023';
    end if;
  end loop;

  if not exists (
    select 1 from public.get_booking_slots(_slug, _service, _answers, (_starts_at at time zone _tz)::date, 1) s
    where s.slot_start = _starts_at
  ) then
    raise exception 'slot unavailable' using errcode = 'P0001', hint = 'slot_taken';
  end if;

  select * into _quote from private.service_quote(_service, _answers);

  -- Link to an existing lead with the same phone, or open a new one
  select l.id into _lead from public.leads l
  where l.org_id = _org.id and regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g') = _phone_digits
  order by l.created_at desc limit 1;

  if _lead is null then
    insert into public.leads (org_id, title, contact_name, phone, email, value, stage, source, notes, created_by)
    values (_org.id, _name, _name, _phone, nullif(_email, ''), _quote.price, 'new',
            case _source when 'whatsapp_bot' then 'WhatsApp' else 'הזמנת תור' end,
            nullif(btrim(coalesce(_address, '')), ''), null)
    returning id into _lead;
  end if;

  begin
    insert into public.appointments (org_id, service_id, lead_id, customer_name, phone, email, address, notes, answers,
                                     starts_at, ends_at, price, status, source, created_by)
    values (_org.id, _svc.id, _lead, _name, _phone, nullif(_email, ''), nullif(btrim(coalesce(_address, '')), ''),
            nullif(btrim(coalesce(_notes, '')), ''), _answers,
            _starts_at, _starts_at + make_interval(mins => _quote.minutes), _quote.price, 'confirmed', _source, null)
    returning * into _appt;
  exception when exclusion_violation then
    raise exception 'slot unavailable' using errcode = 'P0001', hint = 'slot_taken';
  end;

  insert into public.messages (org_id, lead_id, channel, direction, content, sender_id)
  values (_org.id, _lead, case _source when 'whatsapp_bot' then 'whatsapp' else 'web_form' end, 'inbound',
          'נקבע תור ל' || _svc.name || ' ב-' || to_char(_starts_at at time zone _tz, 'DD/MM/YYYY HH24:MI'), null);

  return jsonb_build_object(
    'id', _appt.id,
    'starts_at', _appt.starts_at,
    'ends_at', _appt.ends_at,
    'price', _appt.price,
    'service', _svc.name,
    'org_name', _org.name,
    'channels', (select coalesce(jsonb_agg(distinct j.channel), '[]'::jsonb)
                 from public.notification_jobs j
                 where j.appointment_id = _appt.id and j.kind = 'confirmation' and j.status = 'queued')
  );
end;
$$;

revoke execute on function public.get_booking_page(text) from public;
revoke execute on function public.get_booking_slots(text, uuid, jsonb, date, int) from public;
revoke execute on function public.book_appointment(text, uuid, timestamptz, jsonb, text, text, text, text, text, text) from public;
grant execute on function public.get_booking_page(text) to anon, authenticated;
grant execute on function public.get_booking_slots(text, uuid, jsonb, date, int) to anon, authenticated;
grant execute on function public.book_appointment(text, uuid, timestamptz, jsonb, text, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Notification sender API (server only; same secret as claim_due_reminders)
-- ---------------------------------------------------------------------------
create or replace function private.check_cron_secret(_secret text)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if encode(sha256(convert_to(coalesce(_secret, ''), 'UTF8')), 'hex')
     is distinct from (select s.value from private.app_settings s where s.key = 'cron_secret_sha256') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
end;
$$;

-- Returns due jobs (optionally only one appointment's) and marks them 'sending'.
-- _lookahead_minutes lets a once-a-day caller send reminders that fall before its next run.
create or replace function public.claim_notification_jobs(_secret text, _lookahead_minutes int default 0, _appointment uuid default null)
returns table (
  job_id uuid,
  channel text,
  kind text,
  phone text,
  email text,
  customer_name text,
  service_name text,
  starts_at timestamptz,
  address text,
  org_name text,
  template text,
  subject text
)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.check_cron_secret(_secret);

  -- Messages for visits that were cancelled meanwhile or already started are dropped
  update public.notification_jobs j set status = 'skipped'
  from public.appointments a
  where a.id = j.appointment_id and j.status = 'queued'
    and (a.status not in ('pending', 'confirmed') or a.starts_at <= now());

  return query
  with claimed as (
    update public.notification_jobs j
    set status = 'sending', attempts = j.attempts + 1
    where j.id in (
      select q.id from public.notification_jobs q
      where q.status = 'queued'
        and q.send_at <= now() + make_interval(mins => greatest(coalesce(_lookahead_minutes, 0), 0))
        and (_appointment is null or q.appointment_id = _appointment)
      order by q.send_at
      limit 200
      for update skip locked
    )
    returning j.id, j.channel, j.kind, j.appointment_id, j.automation_id
  )
  select c.id, c.channel, c.kind, a.phone, a.email, a.customer_name, coalesce(s.name, 'השירות'), a.starts_at,
         a.address, o.name, au.config ->> 'template', au.config ->> 'subject'
  from claimed c
  join public.appointments a on a.id = c.appointment_id
  join public.organizations o on o.id = a.org_id
  left join public.services s on s.id = a.service_id
  left join public.automations au on au.id = c.automation_id;
end;
$$;

-- _results: [{ id, status: sent|simulated|failed, provider, provider_message_id, error, content }]
create or replace function public.finish_notification_jobs(_secret text, _results jsonb)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  _n int;
begin
  perform private.check_cron_secret(_secret);

  with r as (
    select (x ->> 'id')::uuid as id,
           case when x ->> 'status' in ('sent', 'simulated', 'failed') then x ->> 'status' else 'failed' end as status,
           left(x ->> 'provider', 40) as provider,
           left(x ->> 'provider_message_id', 200) as provider_message_id,
           left(x ->> 'error', 500) as error,
           left(x ->> 'content', 2000) as content
    from jsonb_array_elements(coalesce(_results, '[]')) x
  ),
  upd as (
    update public.notification_jobs j
    set status = case when r.status = 'failed' and j.attempts < 3 then 'queued' else r.status end,
        provider = r.provider, provider_message_id = r.provider_message_id, error = r.error,
        sent_at = case when r.status in ('sent', 'simulated') then now() end
    from r
    where j.id = r.id and j.status = 'sending'
    returning j.id, j.org_id, j.appointment_id, j.channel, r.status, r.content
  ),
  logged as (
    insert into public.messages (org_id, lead_id, channel, direction, content, sender_id)
    select u.org_id, a.lead_id, u.channel, 'outbound', u.content, null
    from upd u join public.appointments a on a.id = u.appointment_id
    where u.status = 'sent' and a.lead_id is not null and coalesce(u.content, '') <> ''
    returning 1
  )
  select count(*) into _n from upd;
  return _n;
end;
$$;

revoke execute on function public.claim_notification_jobs(text, int, uuid) from public;
revoke execute on function public.finish_notification_jobs(text, jsonb) from public;
grant execute on function public.claim_notification_jobs(text, int, uuid) to anon, authenticated;
grant execute on function public.finish_notification_jobs(text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.services enable row level security;
alter table public.availability_rules enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.calendar_connections enable row level security;
alter table public.external_busy enable row level security;
alter table public.appointments enable row level security;
alter table public.notification_jobs enable row level security;

-- Booking setup: every member reads, admins write
create policy "services_select" on public.services for select to authenticated
  using (private.is_org_member(org_id));
create policy "services_admin_write" on public.services for all to authenticated
  using (private.org_role(org_id) = 'admin') with check (private.org_role(org_id) = 'admin');

create policy "availability_rules_select" on public.availability_rules for select to authenticated
  using (private.is_org_member(org_id));
create policy "availability_rules_admin_write" on public.availability_rules for all to authenticated
  using (private.org_role(org_id) = 'admin') with check (private.org_role(org_id) = 'admin');

create policy "availability_blocks_select" on public.availability_blocks for select to authenticated
  using (private.is_org_member(org_id));
create policy "availability_blocks_admin_write" on public.availability_blocks for all to authenticated
  using (private.org_role(org_id) = 'admin') with check (private.org_role(org_id) = 'admin');

create policy "calendar_connections_select" on public.calendar_connections for select to authenticated
  using (private.is_org_member(org_id));
create policy "calendar_connections_admin_write" on public.calendar_connections for all to authenticated
  using (private.org_role(org_id) = 'admin') with check (private.org_role(org_id) = 'admin');

create policy "external_busy_select" on public.external_busy for select to authenticated
  using (private.is_org_member(org_id));

-- Appointments: the whole team sees the calendar; admins and agents book and
-- update; only admins delete
create policy "appointments_select" on public.appointments for select to authenticated
  using (private.is_org_member(org_id));
create policy "appointments_insert" on public.appointments for insert to authenticated
  with check (private.org_role(org_id) in ('admin', 'agent'));
create policy "appointments_update" on public.appointments for update to authenticated
  using (private.org_role(org_id) in ('admin', 'agent')) with check (private.org_role(org_id) in ('admin', 'agent'));
create policy "appointments_delete_admin" on public.appointments for delete to authenticated
  using (private.org_role(org_id) = 'admin');

create policy "notification_jobs_select" on public.notification_jobs for select to authenticated
  using (private.is_org_member(org_id));

alter publication supabase_realtime add table public.appointments;
