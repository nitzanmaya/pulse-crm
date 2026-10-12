// Server side of the WhatsApp bot: one inbound message in, the bot's replies out.
// ingest (log + load org content) -> engineTurn -> save state (optimistic) ->
// send replies -> record send results. Bookings go through book_appointment,
// which creates or links the lead and the appointment; the event is then
// written to Google Calendar.

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database, Json } from "@/lib/database.types"
import type { BookableService } from "@/lib/booking/shared"
import { env } from "@/lib/env"
import { engineTurn, type Conversation, type ConversationMode, type ConversationState, type EngineContext, type Faq, type MenuItem } from "@/lib/bot/engine"
import { botTexts } from "@/lib/bot/texts"
import { getAvailableSlots, syncPendingAppointments } from "@/lib/calendar/google"
import { geocode } from "@/lib/geo"
import { botMessageText, markRead, sendWhatsAppPayload, toWhatsAppPayload, type EchoMessage, type InboundMessage, type StatusUpdate } from "@/lib/notify/whatsapp"
import { notifyOwnerOfBooking } from "@/lib/notify/owner-email"

type Db = SupabaseClient<Database>

type Ingest = {
  duplicate: boolean
  enabled?: boolean
  org: { id: string; slug: string; name: string; booking_enabled: boolean } | null
  conversation?: { id: string; state: ConversationState; mode: ConversationMode; context: Conversation["context"]; version: number; contact_name: string | null }
  settings?: { handoff_keywords: string[]; restart_keywords: string[] }
  scripts?: Record<string, string>
  faqs?: Faq[]
  menu?: MenuItem[]
  services?: (BookableService & { price: number | string })[]
}

// After the owner answers from the phone, the bot stays quiet in that chat until
// the owner has been silent this long; the customer's next message wakes it
const PHONE_QUIET_MS = 12 * 60 * 60 * 1000

const serverDb = (): Db => createClient<Database>(env.supabaseUrl(), env.supabaseKey(), { auth: { persistSession: false } })

export async function handleInbound(msg: InboundMessage): Promise<{ status: string }> {
  const secret = env.cronSecret()
  const db = serverDb()

  const { data, error } = await db.rpc("bot_ingest", {
    _secret: secret,
    _phone_number_id: msg.phoneNumberId,
    _wa_id: msg.from,
    _name: msg.name ?? null,
    _wa_message_id: msg.id,
    _body: msg.text,
    _payload: (msg.optionId ? { option_id: msg.optionId, type: msg.type } : { type: msg.type }) as Json,
  })
  if (error) throw error
  const ing = data as unknown as Ingest
  if (ing.duplicate) return { status: "duplicate" }
  if (!ing.org || !ing.conversation) return { status: "unknown_number" }
  void markRead(msg.id, msg.phoneNumberId)
  if (!ing.enabled) return { status: "bot_disabled" }

  const org = ing.org
  let conv = ing.conversation
  const phoneReplyAt = (conv.context as { phone_reply_at?: string } | null)?.phone_reply_at
  if (conv.mode === "manual_agent" && phoneReplyAt && Date.now() - Date.parse(phoneReplyAt) > PHONE_QUIET_MS) {
    conv = { ...conv, mode: "bot", state: "WELCOME", context: {} }
  }
  const services = (ing.services ?? []).map((s) => ({ ...s, price: Number(s.price) }))
  const page = org.booking_enabled ? await db.rpc("get_booking_page", { _slug: org.slug }) : null
  const pageOrg = (page?.data as { org?: { windowed?: boolean; max_km?: number | null } } | null)?.org

  const ctx: EngineContext = {
    texts: botTexts(ing.scripts),
    menu: ing.menu ?? [],
    faqs: ing.faqs ?? [],
    handoffKeywords: ing.settings?.handoff_keywords ?? [],
    restartKeywords: ing.settings?.restart_keywords ?? [],
    flow: {
      orgName: org.name,
      customerName: conv.contact_name ?? msg.name,
      services: org.booking_enabled ? services : [],
      getSlots: async (service, answers, place) => {
        const slots = await getAvailableSlots({ db, slug: org.slug, orgId: org.id, serviceId: service.id, answers, days: 14, place })
        return pageOrg?.windowed ? slots.map((s) => ({ ...s, window: true })) : slots
      },
      locate: pageOrg?.max_km ? geocode : undefined,
      book: async ({ service, answers, slot, address, place, email }) => {
        const { data: booked, error: bookError } = await db.rpc("book_appointment_geo", {
          _slug: org.slug,
          _service: service.id,
          _starts_at: slot.start,
          _answers: answers,
          _name: (conv.contact_name ?? msg.name ?? "").trim().length >= 2 ? (conv.contact_name ?? msg.name)! : "לקוח WhatsApp",
          _phone: msg.from,
          _address: address,
          _email: email ?? null,
          _notes: null,
          _source: "whatsapp_bot",
          _lat: place?.lat ?? null,
          _lng: place?.lng ?? null,
        })
        if (bookError) {
          if (bookError.hint !== "slot_taken") console.error("bot booking failed", bookError)
          return { ok: false, error: bookError.message }
        }
        const id = (booked as { id: string }).id
        await notifyOwnerOfBooking(id).catch((e) => console.error("new booking email to the business failed", e))
        return { ok: true, id }
      },
    },
  }

  let turn: Awaited<ReturnType<typeof engineTurn>> | null = null
  let ids: string[] = []
  const save = async (t: NonNullable<typeof turn>, version: number | null) => {
    const outgoing = t.messages.map((m) => ({ body: botMessageText(m), payload: { options: m.options ?? [], card: m.card ?? null } }))
    const { data: saved, error: saveError } = await db.rpc("bot_save_turn", {
      _secret: secret,
      _conversation: conv.id,
      _expected_version: version,
      _state: t.state,
      _mode: t.mode,
      _context: t.context as Json,
      _outgoing: outgoing as Json,
      _appointment: t.appointmentId ?? null,
    })
    if (saveError) throw saveError
    return saved as { ok: boolean; message_ids?: string[]; conversation?: Ingest["conversation"] }
  }
  for (let attempt = 0; attempt < 3 && !turn; attempt++) {
    const t = await engineTurn({ state: conv.state, mode: conv.mode, context: conv.context ?? {} }, { text: msg.text, optionId: msg.optionId }, ctx)
    // A booking already happened, so it is never replayed: force the save
    const result = await save(t, t.appointmentId ? null : conv.version)
    if (result.ok) {
      turn = t
      ids = result.message_ids ?? []
    } else {
      // Another message from the same customer was handled meanwhile: replay on the newer state
      conv = result.conversation ?? conv
    }
  }
  if (!turn) {
    console.warn("bot turn dropped after concurrent updates", conv.id)
    return { status: "conflict" }
  }

  // Replies go out in order
  const updates: { id: string; status: string; wa_message_id?: string; error?: string }[] = []
  for (const [i, m] of turn.messages.entries()) {
    const r = await sendWhatsAppPayload(toWhatsAppPayload(msg.from, m), msg.phoneNumberId)
    if (!ids[i]) break
    updates.push({ id: ids[i], status: r.simulated ? "simulated" : r.ok ? "sent" : "failed", wa_message_id: r.id, error: r.error })
  }
  if (updates.length) await db.rpc("bot_update_messages", { _secret: secret, _updates: updates as Json })

  if (turn.appointmentId) {
    try {
      await syncPendingAppointments({ appointmentId: turn.appointmentId })
    } catch (e) {
      console.error("Google Calendar event failed; the daily job retries", e)
    }
  }
  return { status: turn.state }
}

export async function handleEchoes(echoes: EchoMessage[]) {
  if (!echoes.length) return
  const db = serverDb()
  for (const e of echoes) {
    const { error } = await db.rpc("bot_record_echo", { _secret: env.cronSecret(), _phone_number_id: e.phoneNumberId, _wa_id: e.to, _wa_message_id: e.id, _body: e.text })
    if (error) console.error("bot_record_echo failed", e.id, error)
  }
}

export async function handleStatuses(statuses: StatusUpdate[]) {
  if (!statuses.length) return
  const updates = statuses.map((s) => ({ wa_message_id: s.id, status: s.status, error: s.error }))
  const { error } = await serverDb().rpc("bot_update_messages", { _secret: env.cronSecret(), _updates: updates as Json })
  if (error) console.error("bot_update_messages failed", error)
}
