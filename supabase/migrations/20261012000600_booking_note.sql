-- A short note the business shows on the booking page's service step
-- (pricing terms, minimum order and so on)

alter table public.organizations
  add column booking_note text check (char_length(booking_note) <= 600);

create or replace function public.get_booking_page(_slug text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'org', jsonb_build_object('name', o.name, 'slug', o.slug, 'headline', o.booking_headline,
                              'max_days', o.booking_max_days, 'windowed', jsonb_array_length(o.booking_windows) > 0,
                              'max_km', o.booking_max_km, 'logo', o.booking_logo,
                              'phone', o.booking_phone, 'whatsapp', coalesce(o.booking_whatsapp, o.booking_phone),
                              'min_price', o.booking_min_price, 'note', o.booking_note),
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
