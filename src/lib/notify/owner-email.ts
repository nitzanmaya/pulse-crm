import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import type { Database } from "@/lib/database.types"
import { env } from "@/lib/env"
import { fmtDate, fmtTime } from "@/lib/booking/shared"

type Notice = {
  to: string[]
  org_name: string
  title: string
  customer_name: string
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  answers: Record<string, string> | null
  price: number | null
  source: string
  starts_at: string
  ends_at: string
  window_end: string | null
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

const SOURCE = { booking_page: "דף ההזמנה", whatsapp_bot: "בוט WhatsApp", manual: "ידני" } as Record<string, string>

// Emails the business (reply-to address + admins) about a new booking.
// Best effort: a failure is logged and never blocks the customer's booking.
export async function notifyOwnerOfBooking(appointmentId: string) {
  const secret = process.env.CRON_SECRET
  if (!secret || !process.env.RESEND_API_KEY) return { sent: false, reason: "not configured" }

  const supabase = createClient<Database>(env.supabaseUrl(), env.supabaseKey(), { auth: { persistSession: false } })
  const { data, error } = await supabase.rpc("booking_owner_notice", { _secret: secret, _appointment: appointmentId })
  if (error) throw error
  const n = data as unknown as Notice | null
  if (!n?.to?.length) return { sent: false, reason: "no recipient" }

  const when = `${fmtDate(n.starts_at)} · ${n.window_end ? `הגעה בין ${fmtTime(n.starts_at)}–${n.window_end}` : fmtTime(n.starts_at)}`
  const phoneDigits = (n.phone ?? "").replace(/\D/g, "")
  const wa = phoneDigits ? `https://wa.me/${phoneDigits.replace(/^0/, "972")}` : null
  const rows: [string, string | null][] = [
    ["מה הוזמן", n.title],
    ["מועד", when],
    ["לקוח", n.customer_name],
    ["טלפון", n.phone],
    ["מייל", n.email],
    ["כתובת", n.address],
    ["מחיר משוער", n.price != null ? `₪${Number(n.price).toLocaleString("he-IL")}` : null],
    ...Object.entries(n.answers ?? {}).filter(([k]) => k !== "פריטים").map(([k, v]) => [k, String(v)] as [string, string]),
    ["הערות", n.notes],
    ["מקור", SOURCE[n.source] ?? n.source],
  ]
  const shown = rows.filter(([, v]) => v)
  const text = [`הזמנה חדשה ב${n.org_name}`, "", ...shown.map(([k, v]) => `${k}: ${v}`), "", `ניהול התורים: ${env.siteUrl()}/dashboard`].join("\n")
  const html = `<!doctype html>
<html dir="rtl" lang="he"><body style="margin:0;background:#fdf2f8;font-family:Rubik,Arial,sans-serif;color:#334155">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:24px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,.08);text-align:right">
      <tr><td style="background:linear-gradient(135deg,#10b981,#0ea5e9);padding:28px;text-align:center;color:#fff">
        <div style="font-size:44px;line-height:1">🎉</div>
        <div style="margin-top:10px;font-size:22px;font-weight:700">הזמנה חדשה!</div>
        <div style="margin-top:4px;font-size:15px;opacity:.9">${escapeHtml(n.title)}</div>
      </td></tr>
      <tr><td style="padding:24px 32px">
        <table width="100%" cellpadding="0" cellspacing="0" style="font-size:16px;line-height:1.5">
          ${shown.map(([k, v]) => `<tr><td style="padding:7px 0;color:#64748b;width:120px;vertical-align:top">${escapeHtml(k)}</td><td style="padding:7px 0;color:#0f172a;font-weight:600">${escapeHtml(v!)}</td></tr>`).join("")}
        </table>
      </td></tr>
      <tr><td style="padding:0 32px 32px">
        ${n.phone ? `<a href="tel:${escapeHtml(n.phone)}" style="display:inline-block;margin:0 0 8px 8px;padding:12px 20px;border-radius:12px;background:#0ea5e9;color:#fff;font-weight:700;text-decoration:none">📞 חיוג ללקוח</a>` : ""}
        ${wa ? `<a href="${wa}" style="display:inline-block;margin:0 0 8px 8px;padding:12px 20px;border-radius:12px;background:#25D366;color:#fff;font-weight:700;text-decoration:none">WhatsApp ללקוח</a>` : ""}
        <a href="${escapeHtml(env.siteUrl())}/dashboard" style="display:inline-block;margin:0 0 8px 0;padding:12px 20px;border-radius:12px;background:#f1f5f9;color:#0f172a;font-weight:700;text-decoration:none">לניהול התורים</a>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error: sendError } = await resend.emails.send({
    from: env.emailFromAs(n.org_name),
    replyTo: n.email || undefined,
    to: n.to,
    subject: `הזמנה חדשה: ${n.title} · ${n.customer_name}`,
    text,
    html,
  })
  if (sendError) throw new Error(sendError.message)
  return { sent: true }
}
