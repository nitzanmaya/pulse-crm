import { after, NextResponse, type NextRequest } from "next/server"
import { handleInbound, handleStatuses } from "@/lib/bot/run"
import { parseWebhook, verifySignature } from "@/lib/notify/whatsapp"

// WhatsApp Business Cloud API webhook (Meta app -> WhatsApp -> Configuration).
// Callback URL: https://<site>/api/whatsapp/webhook, verify token: WHATSAPP_VERIFY_TOKEN,
// subscribed field: messages. Each business number is mapped to an org in the
// bot admin (bot_settings.whatsapp_phone_number_id).
export const maxDuration = 30

// Meta's one-time verification handshake
export function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const token = process.env.WHATSAPP_VERIFY_TOKEN
  if (token && q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === token) {
    return new NextResponse(q.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } })
  }
  return NextResponse.json({ error: "forbidden" }, { status: 403 })
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret || !process.env.CRON_SECRET) return NextResponse.json({ error: "not configured" }, { status: 503 })

  const raw = await request.text()
  if (!verifySignature(raw, request.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 })
  }
  const { messages, statuses } = parseWebhook(body)

  // Answer Meta right away; the bot works after the response is sent
  after(async () => {
    await handleStatuses(statuses).catch((e) => console.error("whatsapp statuses failed", e))
    for (const m of messages) {
      try {
        await handleInbound(m)
      } catch (e) {
        console.error("whatsapp message failed", m.id, e)
      }
    }
  })
  return NextResponse.json({ ok: true })
}
