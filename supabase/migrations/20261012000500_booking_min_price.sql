-- Minimum order for the public booking page: a booking (single service or
-- cart) priced below booking_min_price is refused. Bookings the team adds by
-- hand are not limited.

alter table public.organizations
  add column booking_min_price numeric(10, 2) check (booking_min_price between 0 and 100000);

create or replace function private.enforce_booking_min_price()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _min numeric;
begin
  select o.booking_min_price into _min from public.organizations o where o.id = new.org_id;
  if _min is not null and coalesce(new.price, 0) < _min then
    raise exception 'below minimum order' using errcode = 'P0001', hint = 'below_minimum';
  end if;
  return new;
end;
$$;

create trigger appointments_booking_min_price
  before insert on public.appointments
  for each row when (new.source = 'booking_page')
  execute function private.enforce_booking_min_price();

create or replace function public.get_booking_page(_slug text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'org', jsonb_build_object('name', o.name, 'slug', o.slug, 'headline', o.booking_headline,
                              'max_days', o.booking_max_days, 'windowed', jsonb_array_length(o.booking_windows) > 0,
                              'max_km', o.booking_max_km, 'logo', o.booking_logo,
                              'phone', o.booking_phone, 'whatsapp', coalesce(o.booking_whatsapp, o.booking_phone),
                              'min_price', o.booking_min_price),
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
