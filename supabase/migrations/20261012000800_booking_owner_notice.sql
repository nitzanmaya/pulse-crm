-- New booking alert for the business: who to email (the org's reply-to
-- address plus every admin) and what was booked. Server-only, guarded by the
-- cron secret like the other notification RPCs.

create or replace function public.booking_owner_notice(_secret text, _appointment uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  _tz constant text := 'Asia/Jerusalem';
  _result jsonb;
begin
  perform private.check_cron_secret(_secret);

  select jsonb_build_object(
    'to', (
      select coalesce(jsonb_agg(distinct e), '[]'::jsonb)
      from (
        select private.org_reply_to(o.id) as e
        union
        select p.email from public.memberships m join public.profiles p on p.id = m.user_id
        where m.org_id = o.id and m.role = 'admin' and p.email is not null
      ) r where e is not null and e <> ''
    ),
    'org_name', o.name,
    'title', coalesce(a.title, s.name, 'תור'),
    'customer_name', a.customer_name,
    'phone', a.phone,
    'email', a.email,
    'address', a.address,
    'notes', a.notes,
    'answers', a.answers,
    'price', a.price,
    'source', a.source,
    'starts_at', a.starts_at,
    'ends_at', a.ends_at,
    'window_end', (
      select w ->> 'end' from jsonb_array_elements(o.booking_windows) w
      where w ->> 'start' = to_char(a.starts_at at time zone _tz, 'HH24:MI') limit 1
    )
  ) into _result
  from public.appointments a
  join public.organizations o on o.id = a.org_id
  left join public.services s on s.id = a.service_id
  where a.id = _appointment;

  return _result;
end;
$$;

revoke execute on function public.booking_owner_notice(text, uuid) from public;
grant execute on function public.booking_owner_notice(text, uuid) to anon, authenticated;
