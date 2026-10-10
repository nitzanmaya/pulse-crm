import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendWhatsAppPayload, toWhatsAppPayload } from "@/lib/notify/whatsapp"

// Live chat: an agent replies to a WhatsApp conversation from the dashboard.
// RLS decides who may write (admins and agents of the org); inserting the
// message also switches the conversation to manual agent mode (trigger).
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { conversationId?: string; text?: string } | null
  const text = body?.text?.trim().slice(0, 4096)
  if (!body?.conversationId || !text) return NextResponse.json({ error: "bad_request" }, { status: 400 })

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: conv, error: convError } = await supabase
    .from("bot_conversations")
    .select("id, org_id, wa_id, last_inbound_at")
    .eq("id", body.conversationId)
    .single()
  if (convError || !conv) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const { data: settings } = await supabase.from("bot_settings").select("whatsapp_phone_number_id").eq("org_id", conv.org_id).single()

  const { data: msg, error } = await supabase
    .from("bot_conversation_messages")
    .insert({ org_id: conv.org_id, conversation_id: conv.id, direction: "outbound", sender: "agent", body: text, status: "queued" })
    .select()
    .single()
  if (error) return NextResponse.json({ error: "forbidden" }, { status: 403 })

  // Free text reaches the customer only within 24h of their last message
  const windowOpen = conv.last_inbound_at && Date.now() - new Date(conv.last_inbound_at).getTime() < 24 * 3600 * 1000
  const r = windowOpen
    ? await sendWhatsAppPayload(toWhatsAppPayload(conv.wa_id, { text }), settings?.whatsapp_phone_number_id)
    : { ok: false, provider: "meta", error: "חלפו 24 שעות מההודעה האחרונה של הלקוח. WhatsApp מאפשר אז רק תבנית מאושרת." }

  const patch = { status: r.simulated ? "simulated" : r.ok ? "sent" : "failed", wa_message_id: r.id ?? null, error: r.error ?? null } as const
  const { data: updated } = await supabase.from("bot_conversation_messages").update(patch).eq("id", msg.id).select().single()
  return NextResponse.json({ message: updated ?? { ...msg, ...patch } }, { status: r.ok ? 200 : 502 })
}
