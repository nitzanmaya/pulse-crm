const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!)

// Branded wrapper for booking confirmations / reminders (same look as the reminder emails)
export function bookingEmailHtml({ kind, text, org, when, service }: { kind: "confirmation" | "reminder"; text: string; org: string; when: string; service: string }) {
  const body = escapeHtml(text).replace(/\n/g, "<br/>")
  const accent = kind === "confirmation" ? "linear-gradient(135deg,#f43f5e,#ec4899,#8b5cf6)" : "linear-gradient(135deg,#0ea5e9,#6366f1)"
  return `<!doctype html>
<html dir="rtl" lang="he"><body style="margin:0;background:#fdf2f8;font-family:Rubik,Arial,sans-serif;color:#334155">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
    <table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 12px 40px rgba(15,23,42,.08);text-align:right">
      <tr><td style="background:${accent};padding:32px;text-align:center;color:#fff">
        <div style="font-size:48px;line-height:1">${kind === "confirmation" ? "📅" : "🔔"}</div>
        <div style="margin-top:12px;font-size:22px;font-weight:700">${kind === "confirmation" ? "התור נקבע!" : "תזכורת לתור"}</div>
      </td></tr>
      <tr><td style="padding:28px 32px 0">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff1f2;border-radius:16px"><tr>
          <td style="padding:16px 20px;font-size:16px;color:#0f172a"><strong>${escapeHtml(service)}</strong><br/><span style="color:#475569">${escapeHtml(when)}</span></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:24px 32px 8px;font-size:17px;line-height:1.7">${body}</td></tr>
      <tr><td style="padding:20px 32px 32px;font-size:16px;color:#475569">בברכה,<br/><strong style="color:#0f172a">${escapeHtml(org)}</strong></td></tr>
    </table>
  </td></tr></table>
</body></html>`
}
