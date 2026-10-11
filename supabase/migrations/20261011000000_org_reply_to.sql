-- Customer replies to automatic emails go to the business, not to Pulse CRM.
-- Emails are sent from crm@nitzanet.co.il (no mailbox); the server looks up each
-- business's contact address here and sets it as Reply-To.
-- The address is the one the business set in its settings, else the admin who
-- created it, else its earliest admin.

alter table public.organizations add column if not exists reply_email text
  check (reply_email is null or reply_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');

create or replace function private.org_reply_to(_org uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select nullif(o.reply_email, '') from public.organizations o where o.id = _org),
    (select nullif(p.email, '') from public.organizations o join public.profiles p on p.id = o.created_by where o.id = _org),
    (select nullif(p.email, '') from public.memberships m join public.profiles p on p.id = m.user_id
      where m.org_id = _org and m.role = 'admin' and coalesce(p.email, '') <> '' order by m.created_at limit 1)
  )
$$;

-- Server only (same secret as claim_notification_jobs / claim_due_reminders).
-- Maps notification job ids and lead ids to their business's reply-to address.
create or replace function public.reply_to_addresses(_secret text, _job_ids uuid[] default '{}', _lead_ids uuid[] default '{}')
returns table (ref_id uuid, reply_to text)
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.check_cron_secret(_secret);

  return query
  select j.id, private.org_reply_to(j.org_id)
  from public.notification_jobs j
  where j.id = any(coalesce(_job_ids, '{}'))
  union all
  select l.id, private.org_reply_to(l.org_id)
  from public.leads l
  where l.id = any(coalesce(_lead_ids, '{}'));
end;
$$;

revoke execute on function private.org_reply_to(uuid) from public;
revoke execute on function public.reply_to_addresses(text, uuid[], uuid[]) from public;
grant execute on function public.reply_to_addresses(text, uuid[], uuid[]) to anon, authenticated;
