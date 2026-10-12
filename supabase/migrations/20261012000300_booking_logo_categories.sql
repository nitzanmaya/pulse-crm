-- Booking page branding and service groups.
-- booking_logo: the business logo shown instead of its name on the booking
-- page, kept as a small data: URL (the dashboard shrinks uploads to 320px).
-- services.category: groups services ("ניקוי מזגנים", "ניקוי ספות"); with two
-- or more groups the booking page asks for the group first.

alter table public.organizations
  add column booking_logo text check (booking_logo ~ '^data:image/(png|jpeg|webp);base64,' and char_length(booking_logo) <= 400000);

alter table public.services
  add column category text check (char_length(btrim(category)) between 1 and 40);

create or replace function public.get_booking_page(_slug text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'org', jsonb_build_object('name', o.name, 'slug', o.slug, 'headline', o.booking_headline,
                              'max_days', o.booking_max_days, 'windowed', jsonb_array_length(o.booking_windows) > 0,
                              'max_km', o.booking_max_km, 'logo', o.booking_logo),
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
