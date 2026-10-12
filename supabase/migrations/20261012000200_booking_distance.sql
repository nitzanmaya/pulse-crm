-- Distance-aware booking: the customer gives an address first, and a slot is
-- offered only when the visits right before and right after it on the same day
-- are within booking_max_km (straight line). Slots next to an existing visit
-- come back with near = true so the page can show them first. An empty day is
-- open to everyone. Appointments without coordinates (e.g. added by hand
-- without an address) are ignored by the check.

alter table public.organizations
  add column booking_max_km smallint check (booking_max_km between 1 and 300);

alter table public.appointments
  add column lat double precision check (lat between -90 and 90),
  add column lng double precision check (lng between -180 and 180);

create or replace function private.km_between(_lat1 double precision, _lng1 double precision, _lat2 double precision, _lng2 double precision)
returns double precision
language sql immutable
set search_path = ''
as $$
  select 2 * 6371 * asin(sqrt(
    power(sin(radians(_lat2 - _lat1) / 2), 2) +
    cos(radians(_lat1)) * cos(radians(_lat2)) * power(sin(radians(_lng2 - _lng1) / 2), 2)
  ));
$$;

create or replace function public.get_booking_slots_near(
  _slug text, _service uuid, _answers jsonb, _from date, _days integer,
  _lat double precision, _lng double precision
)
returns table(slot_start timestamp with time zone, slot_end timestamp with time zone, near boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare
  _tz constant text := 'Asia/Jerusalem';
  _org public.organizations;
begin
  select * into _org from public.organizations o where o.slug = _slug and o.booking_enabled;
  if not found then raise exception 'booking page not found' using errcode = 'P0002'; end if;

  -- No limit set or no location: same slots as before
  if _org.booking_max_km is null or _lat is null or _lng is null then
    return query select s.slot_start, s.slot_end, false from public.get_booking_slots(_slug, _service, _answers, _from, _days) s;
    return;
  end if;

  return query
  select s.slot_start, s.slot_end, (prev.km is not null or nxt.km is not null)
  from public.get_booking_slots(_slug, _service, _answers, _from, _days) s
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

grant execute on function public.get_booking_slots_near(text, uuid, jsonb, date, integer, double precision, double precision) to anon, authenticated;

-- book_appointment plus the location: the slot must still pass the distance
-- check, and the coordinates are kept for the next customer's check
create or replace function public.book_appointment_geo(
  _slug text, _service uuid, _starts_at timestamp with time zone, _answers jsonb,
  _name text, _phone text, _email text, _address text, _notes text, _source text,
  _lat double precision, _lng double precision
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  _tz constant text := 'Asia/Jerusalem';
  _result jsonb;
begin
  if _lat is not null and (_lat not between -90 and 90 or _lng is null or _lng not between -180 and 180) then
    raise exception 'invalid location' using errcode = '22023';
  end if;

  if _lat is not null and not exists (
    select 1 from public.get_booking_slots_near(_slug, _service, coalesce(_answers, '{}'), (_starts_at at time zone _tz)::date, 1, _lat, _lng) s
    where s.slot_start = _starts_at
  ) then
    raise exception 'slot unavailable' using errcode = 'P0001', hint = 'slot_taken';
  end if;

  _result := public.book_appointment(_slug, _service, _starts_at, _answers, _name, _phone, _email, _address, _notes, _source);

  if _lat is not null then
    update public.appointments set lat = _lat, lng = _lng where id = (_result ->> 'id')::uuid;
  end if;
  return _result;
end;
$$;

grant execute on function public.book_appointment_geo(text, uuid, timestamp with time zone, jsonb, text, text, text, text, text, text, double precision, double precision) to anon, authenticated;

-- The booking page asks for the address first when a distance limit is set
create or replace function public.get_booking_page(_slug text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'org', jsonb_build_object('name', o.name, 'slug', o.slug, 'headline', o.booking_headline,
                              'max_days', o.booking_max_days, 'windowed', jsonb_array_length(o.booking_windows) > 0,
                              'max_km', o.booking_max_km),
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
