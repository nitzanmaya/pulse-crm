import type { DueReminder } from "@/lib/database.types"

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

const heDate = (iso: string) => iso.split("-").reverse().join("/")

function layout({ emoji, accent, heading, body, footer, org }: { emoji: string; accent: string; heading: string; body: string; footer: string; org: string }) {
  return `<!doctype html>
<html dir="rtl" lang="he"><body style="margin:0;background:#fdf2f8;font-family:Rubik,Arial,sans-serif;color:#334155">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,.08);text-align:right">
      <tr><td style="background:${accent};padding:36px 32px;text-align:center;font-size:56px;line-height:1">${emoji}</td></tr>
      <tr><td style="padding:32px 32px 8px;font-size:24px;font-weight:700;color:#0f172a">${heading}</td></tr>
      <tr><td style="padding:8px 32px 0;font-size:17px;line-height:1.7">${body}</td></tr>
      <tr><td style="padding:28px 32px 32px;font-size:16px;color:#475569">${footer}<br/><strong style="color:#0f172a">${org}</strong></td></tr>
    </table>
  </td></tr></table>
</body></html>`
}

export function reminderEmail(r: DueReminder) {
  const name = escapeHtml(r.contact_name || r.lead_title)
  const org = escapeHtml(r.org_name)

  if (r.kind === "birthday") {
    return {
      subject: `${r.contact_name ? `מזל טוב ${r.contact_name}!` : "מזל טוב!"} 🎉 ברכה חמה מ-${r.org_name}`,
      html: layout({
        emoji: "🎂",
        accent: "linear-gradient(135deg,#f43f5e,#ec4899,#8b5cf6)",
        heading: `יום הולדת שמח, ${name}!`,
        body: "רצינו לעצור לרגע ולאחל לך שנה מלאה בבריאות, הצלחה ורגעים טובים. תודה שבחרת בנו, אנחנו שמחים שאת/ה חלק מהמשפחה שלנו.",
        footer: "באהבה ובהערכה,",
        org,
      }),
    }
  }

  return {
    subject: `תזכורת: הגיע הזמן לשירות התקופתי שלך ב-${r.org_name}`,
    html: layout({
      emoji: "🔔",
      accent: "linear-gradient(135deg,#0ea5e9,#6366f1)",
      heading: `שלום ${name}, הגיע הזמן לשירות הבא`,
      body: `לפי הרישומים שלנו, השירות התקופתי שלך מתוכנן ל-<strong>${heDate(r.due)}</strong>. נשמח לתאם מועד שנוח לך. אפשר פשוט להשיב למייל הזה, ונחזור אליך.`,
      footer: "בברכה,",
      org,
    }),
  }
}
