-- WhatsApp coexistence: the business keeps answering from the WhatsApp Business
-- app on its phone while the bot runs on the same number. Meta mirrors every
-- message the owner sends from the phone as an smb_message_echoes webhook.
-- Recording it as an agent message silences the bot in that conversation (the
-- bot_conversation_messages trigger switches it to manual_agent), and
-- context.phone_reply_at lets the server hand the conversation back to the bot
-- once the owner has gone quiet.

create or replace function public.bot_record_echo(
  _secret text,
  _phone_number_id text,
  _wa_id text,
  _wa_message_id text,
  _body text
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  _settings public.bot_settings;
  _conv public.bot_conversations;
  _msg uuid;
begin
  perform private.check_cron_secret(_secret);

  select s.* into _settings from public.bot_settings s where s.whatsapp_phone_number_id = _phone_number_id;
  if not found then return jsonb_build_object('ok', false, 'reason', 'unknown_number'); end if;

  insert into public.bot_conversations (org_id, wa_id)
  values (_settings.org_id, _wa_id)
  on conflict (org_id, wa_id) do update set wa_id = excluded.wa_id
  returning * into _conv;

  insert into public.bot_conversation_messages (org_id, conversation_id, direction, sender, body, payload, wa_message_id, status, sender_id)
  values (_settings.org_id, _conv.id, 'outbound', 'agent', left(coalesce(_body, ''), 4096), jsonb_build_object('source', 'phone'), _wa_message_id, 'sent', null)
  on conflict (wa_message_id) do nothing
  returning id into _msg;
  if _msg is null then return jsonb_build_object('ok', true, 'duplicate', true); end if;

  update public.bot_conversations c
  set context = c.context || jsonb_build_object('phone_reply_at', now()), version = c.version + 1
  where c.id = _conv.id;

  if _conv.lead_id is not null and coalesce(_body, '') <> '' then
    insert into public.messages (org_id, lead_id, channel, direction, content, sender_id)
    values (_settings.org_id, _conv.lead_id, 'whatsapp', 'outbound', left(_body, 4000), null);
  end if;

  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;

grant execute on function public.bot_record_echo(text, text, text, text, text) to anon, authenticated;
