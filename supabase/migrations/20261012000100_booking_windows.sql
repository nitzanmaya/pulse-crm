-- Arrival windows: instead of exact start times every N minutes, the business
-- offers fixed windows (e.g. 08:00-10:00, 10:00-12:00). A booked window is
-- held from its start to its end, or longer when the job itself takes longer,
-- so each window takes one customer. Empty list = exact times as before.

alter table public.organizations
  add column booking_windows jsonb not null default '[]'
    check (jsonb_typeof(booking_windows) = 'array' and jsonb_array_length(booking_windows) <= 24);

create or replace function public.get_booking_slots(_slug text, _service uuid, _answers jsonb default '{}'::jsonb, _from date default null::date, _days integer default 14)
returns table(slot_start timestamp with time zone, slot_end timestamp with time zone)
language plpgsql stable security definer set search_path = ''
as $$
declare
  _tz constant text := 'Asia/Jerusalem';
  _org public.organizations;
  _minutes int;
  _today date := (now() at time zone _tz)::date;
  _start date;
  _end date;
  _windowed boolean;
begin
  select * into _org from public.organizations o where o.slug = _slug and o.booking_enabled;
  if not found then raise exception 'booking page not found' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.services s where s.id = _service and s.org_id = _org.id and s.is_active) then
    raise exception 'service not found' using errcode = 'P0002';
  end if;

  select q.minutes into _minutes from private.service_quote(_service, coalesce(_answers, '{}')) q;
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
    -- A window is offered only inside the working hours of that day
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

-- Same as before, except the appointment ends where the offered slot ends
-- (the end of the window in arrival-window mode)
create or replace function public.book_appointment(_slug text, _service uuid, _starts_at timestamp with time zone, _answers jsonb, _name text, _phone text, _email text default null::text, _address text default null::text, _notes text default null::text, _source text default 'booking_page'::text)
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
  _slot_end timestamptz;
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

  select s.slot_end into _slot_end
  from public.get_booking_slots(_slug, _service, _answers, (_starts_at at time zone _tz)::date, 1) s
  where s.slot_start = _starts_at;
  if _slot_end is null then
    raise exception 'slot unavailable' using errcode = 'P0001', hint = 'slot_taken';
  end if;

  select * into _quote from private.service_quote(_service, _answers);

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
            _starts_at, _slot_end, _quote.price, 'confirmed', _source, null)
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

-- The booking page and the bot label slots as ranges in arrival-window mode
create or replace function public.get_booking_page(_slug text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'org', jsonb_build_object('name', o.name, 'slug', o.slug, 'headline', o.booking_headline,
                              'max_days', o.booking_max_days, 'windowed', jsonb_array_length(o.booking_windows) > 0),
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
