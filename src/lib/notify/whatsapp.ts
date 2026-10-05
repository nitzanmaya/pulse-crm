// WhatsApp sending behind a provider interface.
// - "meta": WhatsApp Business Cloud API (needs WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID).
//   Business-initiated messages must use a pre-approved template; set
//   WHATSAPP_TEMPLATE_CONFIRMATION / WHATSAPP_TEMPLATE_REMINDER to the template
//   names. Their body parameters are, in order: name, service, date, time, address.
// - "simulated" (default until credentials exist): nothing leaves the server,
//   the job is recorded as simulated so the dashboard shows what would be sent.

import type { TemplateVars } from "@/lib/booking/shared"

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
