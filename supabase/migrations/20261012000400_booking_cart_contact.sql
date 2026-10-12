-- Booking page: a cart of several services in one visit, and contact buttons.
--
-- Cart: the customer picks quantities of several services ("2 small ACs + 1
-- sofa"); the visit lasts the sum of their durations and costs the sum of their
-- prices. It is one appointment: service_id points at the first item and
-- appointments.title names the whole visit for the calendar and the messages.
--
-- Contact: booking_phone (call button) and booking_whatsapp (WhatsApp button;
-- the phone number when empty) are shown in a bar at the bottom of the page.
--
-- The slot search moves into private functions that take the visit length, so
-- single services, the distance filter and carts share one implementation.

alter table public.organizations
  add column booking_phone text check (booking_phone ~ '^\+?[0-9]{9,15}$'),
  add column booking_whatsapp text check (booking_whatsapp ~ '^\+?[0-9]{9,15}$');

alter table public.appointments
  add column title text check (char_length(title) <= 300);

-- Free slots of _minutes for an org (body of the former get_booking_slots)
create or replace function private.booking_free_slots(_org public.organizations, _minutes int, _from date, _days int)
returns table(slot_start timestamp with time zone, slot_end timestamp with time zone)
language plpgsql stable set search_path = ''
as $$
declare
  _tz constant text := 'Asia/Jerusalem';
  _today date := (now() at time zone _tz)::date;
  _start date;
  _end date;
  _windowed boolean;
begin
  _start := greatest(coalesce(_from, _today), _today);
  _end := least(_start + least(greatest(coalesce(_days, 14), 1), 62) - 1, _today + _org.booking_max_days);
  _windowed := jsonb_array_length(_org.booking_windows) > 0;

  return query
  with days as (
    select d::date as day from generate_series(_start, _end, interval '1 day') d
  ),
  windows as (
    select (dy.day + r.start_time) at time zone _tz as w_start,
           (dy.day + r.end_time) at time zone _tz as w_end,
           dy.day
    from days dy
    join public.availability_rules r on r.org_id = _org.id and r.weekday = extract(dow from dy.day)::int
    where not exists (
      select 1 from public.availability_blocks b
      where b.org_id = _org.id and dy.day between b.starts_on and b.ends_on
    )
  ),
  arrival as (
    select x.c_start,
           greatest(x.c_window_end, x.c_start + make_interval(mins => _minutes)) as c_end
    from (
      select (dy.day + (bw ->> 'start')::time) at time zone _tz as c_start,
             (dy.day + (bw ->> 'end')::time) at time zone _tz as c_window_end
      from days dy, jsonb_array_elements(_org.booking_windows) bw
      where _windowed
    ) x
  ),
  candidates as (
    select g as c_start, g + make_interval(mins => _minutes) as c_end
    from windows w,
         generate_series(w.w_start, w.w_end - make_interval(mins => _minutes), make_interval(mins => _org.booking_slot_minutes)) g
    where not _windowed
    union all
    select a.c_start, a.c_end
    from arrival a
    where exists (select 1 from windows w where a.c_start >= w.w_start and a.c_end <= w.w_end)
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

-- Same, minus slots too far from that day's neighbouring visits (when the org
-- has a distance limit and a location is given); near = next to a visit
create or replace function private.booking_free_slots_geo(_org public.organizations, _minutes int, _from date, _days int, _lat double precision, _lng double precision)
returns table(slot_start timestamp with time zone, slot_end timestamp with time zone, near boolean)
language plpgsql stable set search_path = ''
as $$
declare
  _tz constant text := 'Asia/Jerusalem';
begin
  if _org.booking_max_km is null or _lat is null or _lng is null then
    return query select s.slot_start, s.slot_end, false from private.booking_free_slots(_org, _minutes, _from, _days) s;
    return;
  end if;

  return query
  select s.slot_start, s.slot_end, (prev.km is not null or nxt.km is not null)
  from private.booking_free_slots(_org, _minutes, _from, _days) s
  left join lateral (
    select private.km_between(_lat, _lng, a.lat, a.lng) as km
    from public.appointments a
    where a.org_id = _org.id and a.status in ('pending', 'confirmed') and a.lat is not null
      and a.ends_at <= s.slot_start
      and (a.starts_at at time zone _tz)::date = (s.slot_start at time zone _tz)::date
    order by a.ends_at desc
    limit 1
  ) prev on true
  left join lateral (
    select private.km_between(_lat, _lng, a.lat, a.lng) as km
    from public.appointments a
    where a.org_id = _org.id and a.status in ('pending', 'confirmed') and a.lat is not null
      and a.starts_at >= s.slot_end
      and (a.starts_at at time zone _tz)::date = (s.slot_start at time zone _tz)::date
    order by a.starts_at
    limit 1
  ) nxt on true
  where coalesce(prev.km, 0) <= _org.booking_max_km
    and coalesce(nxt.km, 0) <= _org.booking_max_km
  order by s.slot_start;
end;
$$;

create or replace function public.get_booking_slots(_slug text, _service uuid, _answers jsonb default '{}'::jsonb, _from date default null::date, _days integer default 14)
returns table(slot_start timestamp with time zone, slot_end timestamp with time zone)
language plpgsql stable security definer set search_path = ''
as $$
declare
  _org public.organizations;
  _minutes int;
begin
  select * into _org from public.organizations o where o.slug = _slug and o.booking_enabled;
  if not found then raise exception 'booking page not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.services s where s.id = _service and s.org_id = _org.id and s.is_active) then
    raise exception 'service not found' using errcode = 'P0002';
  end if;
  select q.minutes into _minutes from private.service_quote(_service, coalesce(_answers, '{}')) q;
  return query select s.slot_start, s.slot_end from private.booking_free_slots(_org, _minutes, _from, _days) s;
end;
$$;

create or replace function public.get_booking_slots_near(
  _slug text, _service uuid, _answers jsonb, _from date, _days integer,
  _lat double precision, _lng double precision
)
returns table(slot_start timestamp with time zone, slot_end timestamp with time zone, near boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  _org public.organizations;
  _minutes int;
begin
  select * into _org from public.organizations o where o.slug = _slug and o.booking_enabled;
  if not found then raise exception 'booking page not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.services s where s.id = _service and s.org_id = _org.id and s.is_active) then
    raise exception 'service not found' using errcode = 'P0002';
  end if;
  select q.minutes into _minutes from private.service_quote(_service, coalesce(_answers, '{}')) q;
  return query select * from private.booking_free_slots_geo(_org, _minutes, _from, _days, _lat, _lng);
end;
$$;

-- _items: [{ "service": uuid, "qty": 1-20 }], up to 20 lines of active services
create or replace function private.cart_quote(_org_id uuid, _items jsonb)
returns table(minutes int, price numeric, title text, first_service uuid)
language plpgsql stable set search_path = ''
as $$
begin
  if coalesce(jsonb_typeof(_items), '') <> 'array' or jsonb_array_length(_items) not between 1 and 20 then
    raise exception 'invalid items' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(_items) i
    where coalesce(jsonb_typeof(i -> 'qty'), '') <> 'number' or (i ->> 'qty')::numeric not between 1 and 20 or (i ->> 'qty')::numeric <> trunc((i ->> 'qty')::numeric)
       or not exists (select 1 from public.services s where s.id::text = i ->> 'service' and s.org_id = _org_id and s.is_active)
  ) then
    raise exception 'invalid items' using errcode = '22023';
  end if;

  return query
  with lines as (
    select s.id, s.name, s.duration_minutes, s.price, sum((i ->> 'qty')::int)::int as qty, min(i.ord) as ord
    from jsonb_array_elements(_items) with ordinality i(i, ord)
    join public.services s on s.id::text = i ->> 'service'
    group by s.id, s.name, s.duration_minutes, s.price
  )
  select sum(l.duration_minutes * l.qty)::int,
         sum(l.price * l.qty),
         left(string_agg(case when l.qty > 1 then l.qty || '× ' else '' end || l.name, ' + ' order by l.ord), 300),
         (array_agg(l.id order by l.ord))[1]
  from lines l;
end;
$$;

create or replace function public.get_booking_slots_cart(
  _slug text, _items jsonb, _from date, _days integer,
  _lat double precision, _lng double precision
)
returns table(slot_start timestamp with time zone, slot_end timestamp with time zone, near boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  _org public.organizations;
  _minutes int;
begin
  select * into _org from public.organizations o where o.slug = _slug and o.booking_enabled;
  if not found then raise exception 'booking page not found' using errcode = 'P0002'; end if;
  select q.minutes into _minutes from private.cart_quote(_org.id, _items) q;
  if _minutes > 16 * 60 then raise exception 'visit too long' using errcode = '22023'; end if;
  return query select * from private.booking_free_slots_geo(_org, _minutes, _from, _days, _lat, _lng);
end;
$$;

grant execute on function public.get_booking_slots_cart(text, jsonb, date, integer, double precision, double precision) to anon, authenticated;

create or replace function public.book_appointment_cart(
  _slug text, _items jsonb, _starts_at timestamp with time zone,
  _name text, _phone text, _email text, _address text, _notes text,
  _lat double precision, _lng double precision
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  _tz constant text := 'Asia/Jerusalem';
  _org public.organizations;
  _quote record;
  _phone_digits text := regexp_replace(coalesce(_phone, ''), '[^0-9]', '', 'g');
  _lead uuid;
  _appt public.appointments;
  _slot_end timestamptz;
begin
  select * into _org from public.organizations o where o.slug = _slug and o.booking_enabled;
  if not found then raise exception 'booking page not found' using errcode = 'P0002'; end if;

  _name := btrim(coalesce(_name, ''));
  if char_length(_name) < 2 or char_length(_name) > 120 then raise exception 'invalid name' using errcode = '22023'; end if;
  if char_length(_phone_digits) not between 9 and 15 then raise exception 'invalid phone' using errcode = '22023'; end if;
  if coalesce(_email, '') <> '' and _email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid email' using errcode = '22023'; end if;
  if _lat is not null and (_lat not between -90 and 90 or _lng is null or _lng not between -180 and 180) then
    raise exception 'invalid location' using errcode = '22023';
  end if;

  select * into _quote from private.cart_quote(_org.id, _items);
  if _quote.minutes > 16 * 60 then raise exception 'visit too long' using errcode = '22023'; end if;

  select s.slot_end into _slot_end
  from private.booking_free_slots_geo(_org, _quote.minutes, (_starts_at at time zone _tz)::date, 1, _lat, _lng) s
  where s.slot_start = _starts_at;
  if _slot_end is null then
    raise exception 'slot unavailable' using errcode = 'P0001', hint = 'slot_taken';
  end if;

  select l.id into _lead from public.leads l
  where l.org_id = _org.id and regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g') = _phone_digits
  order by l.created_at desc limit 1;

  if _lead is null then
    insert into public.leads (org_id, title, contact_name, phone, email, value, stage, source, notes, created_by)
    values (_org.id, _name, _name, _phone, nullif(_email, ''), _quote.price, 'new', 'הזמנת תור',
            nullif(btrim(coalesce(_address, '')), ''), null)
    returning id into _lead;
  end if;

  begin
    insert into public.appointments (org_id, service_id, lead_id, customer_name, phone, email, address, notes, answers,
                                     starts_at, ends_at, price, status, source, created_by, title, lat, lng)
    values (_org.id, _quote.first_service, _lead, _name, _phone, nullif(_email, ''), nullif(btrim(coalesce(_address, '')), ''),
            nullif(btrim(coalesce(_notes, '')), ''), jsonb_build_object('פריטים', _quote.title),
            _starts_at, _slot_end, _quote.price, 'confirmed', 'booking_page', null, _quote.title, _lat, _lng)
    returning * into _appt;
  exception when exclusion_violation then
    raise exception 'slot unavailable' using errcode = 'P0001', hint = 'slot_taken';
  end;

  insert into public.messages (org_id, lead_id, channel, direction, content, sender_id)
  values (_org.id, _lead, 'web_form', 'inbound',
          'נקבע תור ל' || _quote.title || ' ב-' || to_char(_starts_at at time zone _tz, 'DD/MM/YYYY HH24:MI'), null);

  return jsonb_build_object(
    'id', _appt.id,
    'starts_at', _appt.starts_at,
    'ends_at', _appt.ends_at,
    'price', _appt.price,
    'service', _quote.title,
    'org_name', _org.name,
    'channels', (select coalesce(jsonb_agg(distinct j.channel), '[]'::jsonb)
                 from public.notification_jobs j
                 where j.appointment_id = _appt.id and j.kind = 'confirmation' and j.status = 'queued')
  );
end;
$$;

grant execute on function public.book_appointment_cart(text, jsonb, timestamp with time zone, text, text, text, text, text, double precision, double precision) to anon, authenticated;

-- Messages and calendar events name the whole visit when it has a title
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
  select c.id, c.channel, c.kind, a.phone, a.email, a.customer_name, coalesce(a.title, s.name, 'השירות'), a.starts_at,
         a.address, o.name, au.config ->> 'template', au.config ->> 'subject'
  from claimed c
  join public.appointments a on a.id = c.appointment_id
  join public.organizations o on o.id = a.org_id
  left join public.services s on s.id = a.service_id
  left join public.automations au on au.id = c.automation_id;
end;
$$;

create or replace function public.calendar_pending_events(_secret text, _appointment uuid default null, _limit int default 50)
returns table (
  appointment_id uuid, org_id uuid, status text, google_event_id text, starts_at timestamptz, ends_at timestamptz,
  customer_name text, phone text, address text, notes text, service_name text, answers jsonb, org_name text
)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.check_cron_secret(_secret);
  return query
  select a.id, a.org_id, a.status, a.google_event_id, a.starts_at, a.ends_at,
         a.customer_name, a.phone, a.address, a.notes, coalesce(a.title, s.name), a.answers, o.name
  from public.appointments a
  join public.organizations o on o.id = a.org_id
  left join public.services s on s.id = a.service_id
  where a.sync_status = 'pending' and (_appointment is null or a.id = _appointment)
    and exists (select 1 from public.calendar_connections c where c.org_id = a.org_id and c.provider = 'google' and c.status = 'active')
  order by a.updated_at
  limit least(greatest(coalesce(_limit, 50), 1), 200);
end;
$$;

create or replace function public.get_booking_page(_slug text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'org', jsonb_build_object('name', o.name, 'slug', o.slug, 'headline', o.booking_headline,
                              'max_days', o.booking_max_days, 'windowed', jsonb_array_length(o.booking_windows) > 0,
                              'max_km', o.booking_max_km, 'logo', o.booking_logo,
                              'phone', o.booking_phone, 'whatsapp', coalesce(o.booking_whatsapp, o.booking_phone)),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'description', s.description, 'duration_minutes', s.duration_minutes,
        'price', s.price, 'color', s.color, 'questions', s.questions, 'category', s.category) order by s.position, s.created_at)
      from public.services s where s.org_id = o.id and s.is_active
    ), '[]'::jsonb)
  )
  from public.organizations o
  where o.slug = _slug and o.booking_enabled;
$$;
