-- A booked visit moves its lead to "awaiting_visit" (only from the open
-- stages before it; won / lost leads stay where they are)
create or replace function private.lead_awaits_visit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.lead_id is not null and new.status in ('pending', 'confirmed') then
    update public.leads set stage = 'awaiting_visit'
    where id = new.lead_id and stage in ('new', 'in_progress', 'proposal');
  end if;
  return new;
end;
$$;

create trigger appointments_lead_awaits_visit
  after insert on public.appointments
  for each row execute function private.lead_awaits_visit();

-- Leads that already have an upcoming visit
with t as (
  update public.leads l set stage = 'awaiting_visit'
  where l.stage in ('new', 'in_progress', 'proposal')
    and exists (select 1 from public.appointments a
                where a.lead_id = l.id and a.status in ('pending', 'confirmed') and a.starts_at > now())
  returning l.id
) select count(*) from t;
