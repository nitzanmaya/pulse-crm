-- Native WhatsApp bot: editable scripts, menu and FAQ triggers per org,
-- conversations with state + manual agent takeover, message log, and the
-- server-side (secret-guarded) RPCs used by /api/whatsapp/webhook and the
-- Google Calendar service.
--
-- Calendar settings reuse what already exists: organizations.booking_* (slot
-- interval, buffer, notice, horizon), availability_rules (work days + hours),
-- availability_blocks, services.duration_minutes, calendar_connections and
-- private.calendar_credentials.

-- --------------------------------------------------------------------------
-- Bot content
-- --------------------------------------------------------------------------

create table public.bot_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  is_enabled boolean not null default false,
  whatsapp_phone_number_id text unique check (whatsapp_phone_number_id ~ '^[0-9]{5,32}$'),
  whatsapp_display_phone text check (char_length(whatsapp_display_phone) <= 32),
  handoff_keywords text[] not null default array['נציג', 'נציגה', 'בן אדם', 'אדם אמיתי'],
  restart_keywords text[] not null default array['תפריט', 'התחלה', 'היי', 'שלום', 'menu'],
  updated_at timestamptz not null default now()
);
create trigger bot_settings_touch_updated_at before update on public.bot_settings
  for each row execute function private.touch_updated_at();

-- One row per overridden scripted message; missing keys use the defaults in
-- src/lib/bot/texts.ts
create table public.bot_scripts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  key text not null check (key in (
    'welcome', 'fallback', 'handoff', 'faq_prompt', 'anything_else',
    'service_prompt', 'day_prompt', 'time_prompt', 'address_prompt', 'summary_intro',
    'confirmed', 'no_slots', 'retry', 'slot_taken'
  )),
  body text not null check (char_length(body) between 1 and 1000),
  updated_at timestamptz not null default now(),
  unique (org_id, key)
);
create trigger bot_scripts_touch_updated_at before update on public.bot_scripts
  for each row execute function private.touch_updated_at();

create table public.bot_faqs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  question text not null check (char_length(question) between 1 and 120),
  answer text not null check (char_length(answer) between 1 and 1000),
  keywords text[] not null default '{}',
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index bot_faqs_org_idx on public.bot_faqs (org_id, position);

create table public.bot_menu_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  label text not null check (char_length(label) between 1 and 24),
  description text check (char_length(description) <= 72),
  action text not null check (action in ('book', 'faqs', 'faq', 'handoff', 'reply')),
  faq_id uuid references public.bot_faqs (id) on delete cascade,
  reply text check (char_length(reply) <= 1000),
  is_active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  check (action <> 'faq' or faq_id is not null),
  check (action <> 'reply' or coalesce(reply, '') <> '')
);
create index bot_menu_items_org_idx on public.bot_menu_items (org_id, position);

-- --------------------------------------------------------------------------
-- Conversations
-- --------------------------------------------------------------------------

create table public.bot_conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  wa_id text not null check (wa_id ~ '^[0-9]{6,20}$'),
  contact_name text check (char_length(contact_name) <= 120),
  lead_id uuid references public.leads (id) on delete set null,
  state text not null default 'WELCOME' check (state in (
    'WELCOME', 'FAQ', 'SERVICE_SELECT', 'SERVICE_QUESTIONS', 'DATE_SELECT', 'TIME_SELECT',
    'ADDRESS', 'CONFIRM', 'CONFIRMED'
  )),
  mode text not null default 'bot' check (mode in ('bot', 'manual_agent')),
  context jsonb not null default '{}' check (jsonb_typeof(context) = 'object'),
  version integer not null default 0,
  assigned_to uuid references auth.users (id) on delete set null,
  unread integer not null default 0,
  last_message_at timestamptz not null default now(),
  last_inbound_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, wa_id)
);
create index bot_conversations_org_idx on public.bot_conversations (org_id, last_message_at desc);

create table public.bot_conversation_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  conversation_id uuid not null references public.bot_conversations (id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  sender text not null check (sender in ('customer', 'bot', 'agent')),
  body text not null default '' check (char_length(body) <= 4096),
  payload jsonb,
  wa_message_id text unique,
  status text not null default 'received' check (status in ('received', 'queued', 'sent', 'delivered', 'read', 'simulated', 'failed')),
  error text,
  sender_id uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check ((direction = 'inbound') = (sender = 'customer'))
);
create index bot_conversation_messages_conv_idx on public.bot_conversation_messages (conversation_id, created_at);

-- Agent replies from the dashboard bump the conversation and freeze the bot
create or replace function private.bot_message_after_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.bot_conversations c
  set last_message_at = new.created_at,
      mode = case when new.sender = 'agent' then 'manual_agent' else c.mode end,
      unread = case when new.sender = 'agent' then 0 else c.unread end
  where c.id = new.conversation_id;
  return new;
end;
$$;

create trigger bot_conversation_messages_after_insert after insert on public.bot_conversation_messages
  for each row execute function private.bot_message_after_insert();

-- --------------------------------------------------------------------------
-- Defaults for every org
-- --------------------------------------------------------------------------

create or replace function private.seed_bot_defaults(_org uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  _hours uuid;
  _area uuid;
begin
  insert into public.bot_settings (org_id) values (_org) on conflict (org_id) do nothing;
  if exists (select 1 from public.bot_menu_items where org_id = _org) then return; end if;

  insert into public.bot_faqs (org_id, question, answer, keywords, position)
  values (_org, 'מה שעות הפעילות?', E'אנחנו עובדים בימים א׳–ה׳ 08:00–18:00 ובימי ו׳ 08:00–13:00 🕗\nאפשר לקבוע תור כאן בכל שעה.', array['שעות', 'פתוחים', 'פתוח', 'מתי אתם'], 0)
  returning id into _hours;
  insert into public.bot_faqs (org_id, question, answer, keywords, position)
  values (_org, 'כמה זה עולה?', E'המחיר מופיע ליד כל שירות בתפריט קביעת התור, והוא מתעדכן לפי הכמות שבוחרים 💰', array['מחיר', 'עולה', 'עלות', 'כמה זה'], 1)
  returning id into _area;

  insert into public.bot_menu_items (org_id, label, description, action, position) values
    (_org, '📅 קביעת תור', 'בחירת שירות ושעה פנויה', 'book', 0),
    (_org, '❓ שאלות נפוצות', 'מחירים, שעות ועוד', 'faqs', 1),
    (_org, '🙋 שיחה עם נציג', 'נחזור אליך בהקדם', 'handoff', 2);
end;
$$;

create or replace function private.on_org_created()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.seed_booking_defaults(new.id);
  perform private.seed_bot_defaults(new.id);
  return new;
end;
$$;

do $$ begin perform private.seed_bot_defaults(id) from public.organizations; end $$;

-- The bot confirms in the chat itself, so a bot booking skips the WhatsApp
-- confirmation job (the reminder and the email still go out).
create or replace function private.appointment_after_insert()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status not in ('pending', 'confirmed') then return new; end if;

  insert into public.notification_jobs (org_id, appointment_id, automation_id, channel, kind, send_at, status)
  select new.org_id, new.id, a.id, j.channel, j.kind, j.send_at,
         case
           when j.channel = 'whatsapp' and coalesce(new.phone, '') = '' then 'skipped'
           when j.channel = 'email' and coalesce(new.email, '') = '' then 'skipped'
           when j.channel = 'whatsapp' and j.kind = 'confirmation' and new.source = 'whatsapp_bot' then 'skipped'
           when j.kind = 'reminder' and j.send_at <= now() then 'skipped'
           else 'queued'
         end
  from public.automations a
  cross join lateral (
    select case a.action_type when 'send_whatsapp' then 'whatsapp' else 'email' end as channel,
           coalesce(a.config ->> 'kind', 'confirmation') as kind,
           case when a.config ->> 'kind' = 'reminder'
                then new.starts_at - make_interval(hours => coalesce((a.config ->> 'offset_hours')::int, 24))
                else now() end as send_at
  ) j
  where a.org_id = new.org_id and a.is_active
    and a.trigger_event = 'appointment_booked'
    and a.action_type in ('send_whatsapp', 'send_email')
  on conflict (appointment_id, channel, kind) do nothing;

  return new;
end;
$$;

-- --------------------------------------------------------------------------
-- Webhook RPCs (server only: guarded by the CRON_SECRET hash)
-- --------------------------------------------------------------------------

-- Records an inbound message and returns everything the bot engine needs in
-- one round trip. duplicate=true when Meta re-delivers a message.
create or replace function public.bot_ingest(
  _secret text,
  _phone_number_id text,
  _wa_id text,
  _name text,
  _wa_message_id text,
  _body text,
  _payload jsonb default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  _org public.organizations;
  _settings public.bot_settings;
  _conv public.bot_conversations;
  _msg uuid;
begin
  perform private.check_cron_secret(_secret);

  select s.* into _settings from public.bot_settings s where s.whatsapp_phone_number_id = _phone_number_id;
  if not found then return jsonb_build_object('org', null); end if;
  select o.* into _org from public.organizations o where o.id = _settings.org_id;

  insert into public.bot_conversations (org_id, wa_id, contact_name, last_inbound_at)
  values (_org.id, _wa_id, nullif(left(btrim(coalesce(_name, '')), 120), ''), now())
  on conflict (org_id, wa_id) do update
    set contact_name = coalesce(excluded.contact_name, public.bot_conversations.contact_name),
        last_inbound_at = now()
  returning * into _conv;

  if _conv.lead_id is null then
    update public.bot_conversations c set lead_id = l.id
    from (
      select l.id from public.leads l
      where l.org_id = _org.id
        and right(regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g'), 9) = right(_wa_id, 9)
      order by l.created_at desc limit 1
    ) l
    where c.id = _conv.id
    returning c.* into _conv;
    if _conv.id is null then
      select * into _conv from public.bot_conversations where org_id = _org.id and wa_id = _wa_id;
    end if;
  end if;

  insert into public.bot_conversation_messages (org_id, conversation_id, direction, sender, body, payload, wa_message_id, status, sender_id)
  values (_org.id, _conv.id, 'inbound', 'customer', left(coalesce(_body, ''), 4096), _payload, _wa_message_id, 'received', null)
  on conflict (wa_message_id) do nothing
  returning id into _msg;

  if _msg is null then return jsonb_build_object('duplicate', true); end if;

  update public.bot_conversations set unread = unread + 1 where id = _conv.id returning * into _conv;

  if _conv.lead_id is not null then
    insert into public.messages (org_id, lead_id, channel, direction, content, sender_id)
    values (_org.id, _conv.lead_id, 'whatsapp', 'inbound', left(coalesce(nullif(_body, ''), '[הודעה]'), 4000), null);
  end if;

  return jsonb_build_object(
    'duplicate', false,
    'enabled', _settings.is_enabled,
    'org', jsonb_build_object('id', _org.id, 'slug', _org.slug, 'name', _org.name, 'booking_enabled', _org.booking_enabled),
    'conversation', to_jsonb(_conv),
    'settings', jsonb_build_object('handoff_keywords', _settings.handoff_keywords, 'restart_keywords', _settings.restart_keywords),
    'scripts', coalesce((select jsonb_object_agg(s.key, s.body) from public.bot_scripts s where s.org_id = _org.id), '{}'::jsonb),
    'faqs', coalesce((
      select jsonb_agg(jsonb_build_object('id', f.id, 'question', f.question, 'answer', f.answer, 'keywords', f.keywords) order by f.position, f.created_at)
      from public.bot_faqs f where f.org_id = _org.id and f.is_active
    ), '[]'::jsonb),
    'menu', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'label', m.label, 'description', m.description, 'action', m.action, 'faq_id', m.faq_id, 'reply', m.reply) order by m.position, m.created_at)
      from public.bot_menu_items m where m.org_id = _org.id and m.is_active
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'description', s.description, 'duration_minutes', s.duration_minutes,
                                          'price', s.price, 'color', s.color, 'questions', s.questions) order by s.position, s.created_at)
      from public.services s where s.org_id = _org.id and s.is_active
    ), '[]'::jsonb)
  );
end;
$$;

-- Saves the conversation state after a bot turn and queues the bot's replies.
-- Optimistic: with _expected_version it fails when another message was handled
-- meanwhile and returns the newer conversation; null forces the save.
-- Returns the ids of the queued messages, in order.
create or replace function public.bot_save_turn(
  _secret text,
  _conversation uuid,
  _expected_version int,
  _state text,
  _mode text,
  _context jsonb,
  _outgoing jsonb default '[]',
  _appointment uuid default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  _conv public.bot_conversations;
  _lead uuid;
  _ids jsonb;
begin
  perform private.check_cron_secret(_secret);

  if _appointment is not null then
    select a.lead_id into _lead from public.appointments a where a.id = _appointment;
  end if;

  update public.bot_conversations c
  set state = _state, mode = _mode, context = coalesce(_context, '{}'), version = c.version + 1,
      lead_id = coalesce(_lead, c.lead_id)
  where c.id = _conversation and (_expected_version is null or c.version = _expected_version)
  returning * into _conv;
  if not found then
    return jsonb_build_object('ok', false, 'conversation', (select to_jsonb(c) from public.bot_conversations c where c.id = _conversation));
  end if;

  with o as (
    select x, ord from jsonb_array_elements(coalesce(_outgoing, '[]')) with ordinality as t (x, ord)
  ),
  ins as (
    insert into public.bot_conversation_messages (org_id, conversation_id, direction, sender, body, payload, status, sender_id, created_at)
    select _conv.org_id, _conv.id, 'outbound', 'bot', left(coalesce(o.x ->> 'body', ''), 4096), o.x -> 'payload', 'queued', null,
           clock_timestamp() + make_interval(secs => o.ord / 1000.0)
    from o order by o.ord
    returning id, created_at
  )
  select coalesce(jsonb_agg(id order by created_at), '[]'::jsonb) into _ids from ins;

  if _conv.lead_id is not null then
    insert into public.messages (org_id, lead_id, channel, direction, content, sender_id)
    select _conv.org_id, _conv.lead_id, 'whatsapp', 'outbound', left(o.x ->> 'body', 4000), null
    from jsonb_array_elements(coalesce(_outgoing, '[]')) o (x)
    where coalesce(o.x ->> 'body', '') <> '';
  end if;

  return jsonb_build_object('ok', true, 'message_ids', _ids, 'lead_id', _conv.lead_id);
end;
$$;

-- Send results and Meta delivery receipts (sent / delivered / read / failed)
create or replace function public.bot_update_messages(_secret text, _updates jsonb)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  _n int;
begin
  perform private.check_cron_secret(_secret);
  with u as (
    select (x ->> 'id')::uuid as id, x ->> 'wa_message_id' as wa_id, x ->> 'status' as status, left(x ->> 'error', 500) as error
    from jsonb_array_elements(coalesce(_updates, '[]')) x
    where x ->> 'status' in ('sent', 'delivered', 'read', 'simulated', 'failed')
  ),
  upd as (
    update public.bot_conversation_messages m
    set status = case
                   -- receipts can arrive out of order; never step back from read
                   when m.status = 'read' and u.status in ('sent', 'delivered') then m.status
                   when m.status = 'delivered' and u.status = 'sent' then m.status
                   else u.status end,
        wa_message_id = coalesce(m.wa_message_id, u.wa_id),
        error = coalesce(u.error, m.error)
    from u
    where m.direction = 'outbound' and ((u.id is not null and m.id = u.id) or (u.id is null and m.wa_message_id = u.wa_id))
    returning 1
  )
  select count(*) into _n from upd;
  return _n;
end;
$$;

-- --------------------------------------------------------------------------
-- Google Calendar RPCs (server only)
-- --------------------------------------------------------------------------

create or replace function public.calendar_store_connection(
  _secret text, _org uuid, _user uuid, _email text, _calendar_id text,
  _refresh_token text, _access_token text, _expires_at timestamptz
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  _id uuid;
begin
  perform private.check_cron_secret(_secret);
  if private.org_role_of(_org, _user) is distinct from 'admin' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- One Google calendar per org
  delete from public.calendar_connections where org_id = _org and provider = 'google' and calendar_id <> coalesce(_calendar_id, 'primary');

  insert into public.calendar_connections (org_id, user_id, provider, account_email, calendar_id, sync_direction, status, last_error)
  values (_org, _user, 'google', _email, coalesce(_calendar_id, 'primary'), 'two_way', 'active', null)
  on conflict (org_id, provider, calendar_id) do update
    set user_id = excluded.user_id, account_email = excluded.account_email, status = 'active', last_error = null
  returning id into _id;

  insert into private.calendar_credentials (connection_id, refresh_token, access_token, expires_at)
  values (_id, _refresh_token, _access_token, _expires_at)
  on conflict (connection_id) do update
    set refresh_token = coalesce(nullif(excluded.refresh_token, ''), private.calendar_credentials.refresh_token),
        access_token = excluded.access_token, expires_at = excluded.expires_at;

  -- Appointments still ahead go to the newly connected calendar
  update public.appointments set sync_status = 'pending'
  where org_id = _org and status in ('pending', 'confirmed') and ends_at > now() and google_event_id is null;

  return _id;
end;
$$;

create or replace function public.calendar_get_access(_secret text, _org uuid)
returns table (connection_id uuid, calendar_id text, refresh_token text, access_token text, expires_at timestamptz)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.check_cron_secret(_secret);
  return query
  select c.id, c.calendar_id, k.refresh_token, k.access_token, k.expires_at
  from public.calendar_connections c
  join private.calendar_credentials k on k.connection_id = c.id
  where c.org_id = _org and c.provider = 'google' and c.status = 'active'
  order by c.created_at limit 1;
end;
$$;

create or replace function public.calendar_save_access(
  _secret text, _connection uuid, _access_token text, _expires_at timestamptz, _error text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.check_cron_secret(_secret);
  if _error is not null then
    update public.calendar_connections set status = 'error', last_error = left(_error, 500) where id = _connection;
    return;
  end if;
  update private.calendar_credentials set access_token = _access_token, expires_at = _expires_at where connection_id = _connection;
end;
$$;

-- Appointments waiting to be pushed to Google (new, moved or cancelled)
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
         a.customer_name, a.phone, a.address, a.notes, s.name, a.answers, o.name
  from public.appointments a
  join public.organizations o on o.id = a.org_id
  left join public.services s on s.id = a.service_id
  where a.sync_status = 'pending' and (_appointment is null or a.id = _appointment)
    and exists (select 1 from public.calendar_connections c where c.org_id = a.org_id and c.provider = 'google' and c.status = 'active')
  order by a.updated_at
  limit least(greatest(coalesce(_limit, 50), 1), 200);
end;
$$;

create or replace function public.calendar_mark_synced(_secret text, _appointment uuid, _event_id text, _error text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.check_cron_secret(_secret);
  update public.appointments
  set google_event_id = case when _error is null then _event_id else google_event_id end,
      sync_status = case when _error is null then 'synced' else 'error' end,
      synced_at = case when _error is null then now() else synced_at end
  where id = _appointment;
  update public.calendar_connections c set last_synced_at = now(), last_error = left(_error, 500)
  from public.appointments a where a.id = _appointment and c.org_id = a.org_id and c.provider = 'google' and c.status = 'active';
end;
$$;

-- Role of any user (the session-bound private.org_role uses auth.uid())
create or replace function private.org_role_of(_org uuid, _user uuid)
returns text language sql stable security definer set search_path = ''
as $$ select m.role::text from public.memberships m where m.org_id = _org and m.user_id = _user $$;

do $$
declare f text;
begin
  foreach f in array array[
    'bot_ingest(text, text, text, text, text, text, jsonb)',
    'bot_save_turn(text, uuid, int, text, text, jsonb, jsonb, uuid)',
    'bot_update_messages(text, jsonb)',
    'calendar_store_connection(text, uuid, uuid, text, text, text, text, timestamptz)',
    'calendar_get_access(text, uuid)',
    'calendar_save_access(text, uuid, text, timestamptz, text)',
    'calendar_pending_events(text, uuid, int)',
    'calendar_mark_synced(text, uuid, text, text)'
  ] loop
    execute format('revoke execute on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;

-- --------------------------------------------------------------------------
-- RLS
-- --------------------------------------------------------------------------

alter table public.bot_settings enable row level security;
alter table public.bot_scripts enable row level security;
alter table public.bot_faqs enable row level security;
alter table public.bot_menu_items enable row level security;
alter table public.bot_conversations enable row level security;
alter table public.bot_conversation_messages enable row level security;

create policy "bot_settings_select" on public.bot_settings for select to authenticated
  using (private.is_org_member(org_id));
create policy "bot_settings_admin_write" on public.bot_settings for all to authenticated
  using (private.org_role(org_id) = 'admin') with check (private.org_role(org_id) = 'admin');

create policy "bot_scripts_select" on public.bot_scripts for select to authenticated
  using (private.is_org_member(org_id));
create policy "bot_scripts_admin_write" on public.bot_scripts for all to authenticated
  using (private.org_role(org_id) = 'admin') with check (private.org_role(org_id) = 'admin');

create policy "bot_faqs_select" on public.bot_faqs for select to authenticated
  using (private.is_org_member(org_id));
create policy "bot_faqs_admin_write" on public.bot_faqs for all to authenticated
  using (private.org_role(org_id) = 'admin') with check (private.org_role(org_id) = 'admin');

create policy "bot_menu_items_select" on public.bot_menu_items for select to authenticated
  using (private.is_org_member(org_id));
create policy "bot_menu_items_admin_write" on public.bot_menu_items for all to authenticated
  using (private.org_role(org_id) = 'admin') with check (private.org_role(org_id) = 'admin');

create policy "bot_conversations_select" on public.bot_conversations for select to authenticated
  using (private.is_org_member(org_id));
create policy "bot_conversations_update" on public.bot_conversations for update to authenticated
  using (private.org_role(org_id) in ('admin', 'agent')) with check (private.org_role(org_id) in ('admin', 'agent'));
create policy "bot_conversations_delete_admin" on public.bot_conversations for delete to authenticated
  using (private.org_role(org_id) = 'admin');

create policy "bot_conversation_messages_select" on public.bot_conversation_messages for select to authenticated
  using (private.is_org_member(org_id));
create policy "bot_conversation_messages_agent_insert" on public.bot_conversation_messages for insert to authenticated
  with check (
    private.org_role(org_id) in ('admin', 'agent')
    and direction = 'outbound' and sender = 'agent' and sender_id = auth.uid()
    and exists (select 1 from public.bot_conversations c where c.id = conversation_id and c.org_id = bot_conversation_messages.org_id)
  );
create policy "bot_conversation_messages_agent_update" on public.bot_conversation_messages for update to authenticated
  using (private.org_role(org_id) in ('admin', 'agent') and sender = 'agent')
  with check (private.org_role(org_id) in ('admin', 'agent') and sender = 'agent');

alter publication supabase_realtime add table public.bot_conversations, public.bot_conversation_messages;
