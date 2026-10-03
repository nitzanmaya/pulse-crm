import { Resend } from "resend"
import { env } from "@/lib/env"

type InviteEmail = {
  to: string
  orgName: string
  inviterName: string
  role: "admin" | "agent"
  token: string
}

const roleLabel = { admin: "מנהל/ת", agent: "נציג/ה" } as const

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)
}

export async function sendInviteEmail({ to, orgName, inviterName, role, token }: InviteEmail) {
  const resend = new Resend(env.resendKey())
  const link = `${env.siteUrl()}/invite/${token}`
  const org = escapeHtml(orgName)
  const inviter = escapeHtml(inviterName)

  return resend.emails.send({
    from: env.emailFrom(),
    to,
    subject: `${inviterName} הזמין/ה אותך להצטרף ל-${orgName} ב-Pulse CRM`,
    html: `<!doctype html>
<html dir="rtl" lang="he"><body style="margin:0;background:#09090b;font-family:Assistant,Arial,sans-serif;color:#e4e4e7">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px"><tr><td align="center">
    <table width="480" cellpadding="0" cellspacing="0" style="background:#18181b;border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:32px;text-align:right">
      <tr><td style="font-size:20px;font-weight:700;color:#fff">Pulse CRM</td></tr>
      <tr><td style="padding-top:16px;font-size:16px;line-height:1.6">
        ${inviter} הזמין/ה אותך להצטרף לארגון <strong style="color:#fff">${org}</strong> בתפקיד ${roleLabel[role]}.
      </td></tr>
      <tr><td style="padding-top:24px">
        <a href="${link}" style="display:inline-block;background:#fff;color:#09090b;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">הצטרפות לארגון</a>
      </td></tr>
      <tr><td style="padding-top:24px;font-size:13px;color:#a1a1aa">ההזמנה בתוקף ל-7 ימים. אם לא ציפית להזמנה, אפשר להתעלם מהמייל.</td></tr>
    </table>
  </td></tr></table>
</body></html>`,
  })
}
