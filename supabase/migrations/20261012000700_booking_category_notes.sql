-- Per-group notes on the booking page ({"ניקוי ספות": "המחירים מתייחסים..."}),
-- shown above that group's services

alter table public.organizations
  add column booking_category_notes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(booking_category_notes) = 'object' and pg_column_size(booking_category_notes) <= 20000);

create or replace function public.get_booking_page(_slug text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'org', jsonb_build_object('name', o.name, 'slug', o.slug, 'headline', o.booking_headline,
                              'max_days', o.booking_max_days, 'windowed', jsonb_array_length(o.booking_windows) > 0,
                              'max_km', o.booking_max_km, 'logo', o.booking_logo,
                              'phone', o.booking_phone, 'whatsapp', coalesce(o.booking_whatsapp, o.booking_phone),
                              'min_price', o.booking_min_price, 'note', o.booking_note,
                              'category_notes', o.booking_category_notes),
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
