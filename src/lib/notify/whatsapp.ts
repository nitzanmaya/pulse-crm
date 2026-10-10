// WhatsApp sending behind a provider interface.
// - "meta": WhatsApp Business Cloud API (needs WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID).
//   Business-initiated messages must use a pre-approved template; set
//   WHATSAPP_TEMPLATE_CONFIRMATION / WHATSAPP_TEMPLATE_REMINDER to the template
//   names. Their body parameters are, in order: name, service, date, time, address.
// - "simulated" (default until credentials exist): nothing leaves the server,
//   the job is recorded as simulated so the dashboard shows what would be sent.

import { createHmac, timingSafeEqual } from "node:crypto"
import type { TemplateVars } from "@/lib/booking/shared"
import type { BotMessage } from "@/lib/bot/flow"

export type WhatsAppMessage = { to: string; text: string; kind: "confirmation" | "reminder"; vars: TemplateVars }
export type SendResult = { ok: boolean; simulated?: boolean; provider: string; id?: string; error?: string }

export interface WhatsAppProvider {
  name: string
  live: boolean
  send(msg: WhatsAppMessage): Promise<SendResult>
}

// Israeli local numbers (05x...) to E.164 digits (9725x...)
export function toE164(phone: string) {
  const digits = phone.replace(/[^0-9]/g, "")
  if (digits.startsWith("972")) return digits
  if (digits.startsWith("0")) return `972${digits.slice(1)}`
  return digits
}

const simulated: WhatsAppProvider = {
  name: "simulated",
  live: false,
  async send() {
    return { ok: true, simulated: true, provider: "simulated" }
  },
}

function metaCloud(token: string, phoneNumberId: string): WhatsAppProvider {
  const version = process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0"
  return {
    name: "meta",
    live: true,
    async send(msg) {
      const template = msg.kind === "reminder" ? process.env.WHATSAPP_TEMPLATE_REMINDER : process.env.WHATSAPP_TEMPLATE_CONFIRMATION
      const v = msg.vars
      const body = template
        ? {
            messaging_product: "whatsapp",
            to: toE164(msg.to),
            type: "template",
            template: {
              name: template,
              language: { code: process.env.WHATSAPP_TEMPLATE_LANG ?? "he" },
              components: [{ type: "body", parameters: [v.name, v.service, v.date, v.time, v.address].map((text) => ({ type: "text", text })) }],
            },
          }
        : // Free text only reaches customers who wrote to the business in the last 24 hours
          { messaging_product: "whatsapp", to: toE164(msg.to), type: "text", text: { body: msg.text } }

      const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } }
      if (!res.ok) return { ok: false, provider: "meta", error: json.error?.message ?? `HTTP ${res.status}` }
      return { ok: true, provider: "meta", id: json.messages?.[0]?.id }
    },
  }
}

export function whatsappProvider(): WhatsAppProvider {
  const token = process.env.WHATSAPP_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (token && phoneNumberId) return metaCloud(token, phoneNumberId)
  return simulated
}

// ---------------------------------------------------------------------------
// Conversational (in-session) messages for the bot and live chat.
// Inside the 24h customer-service window free text and interactive messages
// need no template.
// ---------------------------------------------------------------------------


const graphVersion = () => process.env.WHATSAPP_GRAPH_VERSION ?? "v21.0"
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export const whatsappLive = () => Boolean(process.env.WHATSAPP_TOKEN)

// Renders a bot message as text the way WhatsApp will show it (card lines folded in)
export function botMessageText(m: BotMessage) {
  const card = m.card ? [`*${m.card.title}*`, ...m.card.lines].join("\n") : ""
  return [m.text, card].filter(Boolean).join("\n\n")
}

// Up to 3 short options become reply buttons, up to 10 a list, more a numbered text
export function toWhatsAppPayload(to: string, m: BotMessage): Record<string, unknown> {
  const body = botMessageText(m) || "👇"
  const options = m.options ?? []
  const base = { messaging_product: "whatsapp", recipient_type: "individual", to: toE164(to) }
  if (!options.length) return { ...base, type: "text", text: { body: cut(body, 4096), preview_url: false } }
  if (options.length <= 3 && options.every((o) => o.label.length <= 20)) {
    return {
      ...base,
      type: "interactive",
      interactive: { type: "button", body: { text: cut(body, 1024) }, action: { buttons: options.map((o) => ({ type: "reply", reply: { id: o.id.slice(0, 256), title: o.label } })) } },
    }
  }
  if (options.length <= 10) {
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: cut(body, 4096) },
        action: {
          button: "בחירה",
          sections: [{ title: "אפשרויות", rows: options.map((o) => ({ id: o.id.slice(0, 200), title: cut(o.label, 24), ...(o.description || o.label.length > 24 ? { description: cut(o.description ?? o.label, 72) } : {}) })) }],
        },
      },
    }
  }
  const numbered = options.map((o, i) => `${i + 1}. ${o.label}`).join("\n")
  return { ...base, type: "text", text: { body: cut(`${body}\n\n${numbered}\n\nאפשר לענות במספר 🔢`, 4096) } }
}

// Sends one prepared payload from the given business number (falls back to WHATSAPP_PHONE_NUMBER_ID)
export async function sendWhatsAppPayload(payload: Record<string, unknown>, phoneNumberId?: string | null): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN
  const from = phoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !from) return { ok: true, simulated: true, provider: "simulated" }
  try {
    const res = await fetch(`https://graph.facebook.com/${graphVersion()}/${from}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } }
    if (!res.ok) return { ok: false, provider: "meta", error: json.error?.message ?? `HTTP ${res.status}` }
    return { ok: true, provider: "meta", id: json.messages?.[0]?.id }
  } catch (e) {
    return { ok: false, provider: "meta", error: e instanceof Error ? e.message : String(e) }
  }
}

// Marks an inbound message as read (blue ticks) and shows the typing indicator
export async function markRead(messageId: string, phoneNumberId: string) {
  const token = process.env.WHATSAPP_TOKEN
  if (!token) return
  await fetch(`https://graph.facebook.com/${graphVersion()}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: messageId, typing_indicator: { type: "text" } }),
  }).catch(() => {})
}

// X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(raw body, app secret)
export function verifySignature(raw: string, header: string | null, appSecret: string) {
  if (!header?.startsWith("sha256=")) return false
  const expected = Buffer.from(createHmac("sha256", appSecret).update(raw, "utf8").digest("hex"))
  const got = Buffer.from(header.slice(7))
  return expected.length === got.length && timingSafeEqual(expected, got)
}

export type InboundMessage = {
  phoneNumberId: string
  from: string
  name?: string
  id: string
  text: string
  optionId?: string
  type: string
}
export type StatusUpdate = { id: string; status: string; error?: string }

type WebhookBody = {
  entry?: {
    changes?: {
      field?: string
      value?: {
        metadata?: { phone_number_id?: string }
        contacts?: { wa_id?: string; profile?: { name?: string } }[]
        messages?: {
          from: string
          id: string
          type: string
          text?: { body?: string }
          button?: { text?: string; payload?: string }
          interactive?: { button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } }
        }[]
        statuses?: { id: string; status: string; errors?: { title?: string; message?: string }[] }[]
      }
    }[]
  }[]
}

export function parseWebhook(body: unknown): { messages: InboundMessage[]; statuses: StatusUpdate[] } {
  const messages: InboundMessage[] = []
  const statuses: StatusUpdate[] = []
  for (const entry of (body as WebhookBody)?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value
      const phoneNumberId = v?.metadata?.phone_number_id
      if (!v || !phoneNumberId) continue
      for (const m of v.messages ?? []) {
        const reply = m.interactive?.button_reply ?? m.interactive?.list_reply
        messages.push({
          phoneNumberId,
          from: m.from,
          name: v.contacts?.find((c) => c.wa_id === m.from)?.profile?.name ?? v.contacts?.[0]?.profile?.name,
          id: m.id,
          type: m.type,
          text: reply?.title ?? m.text?.body ?? m.button?.text ?? "",
          optionId: reply?.id,
        })
      }
      for (const s of v.statuses ?? []) {
        statuses.push({ id: s.id, status: s.status, error: s.errors?.map((e) => e.message ?? e.title).join("; ") || undefined })
      }
    }
  }
  return { messages, statuses }
}
