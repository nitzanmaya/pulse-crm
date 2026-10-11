function required(name: string, value: string | undefined) {
  if (!value) throw new Error(`Missing environment variable: ${name}`)
  return value
}

export const env = {
  supabaseUrl: () => required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseKey: () =>
    required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  siteUrl: () => process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  resendKey: () => required("RESEND_API_KEY", process.env.RESEND_API_KEY),
  cronSecret: () => required("CRON_SECRET", process.env.CRON_SECRET),
  emailFrom: () => process.env.EMAIL_FROM ?? "Pulse CRM <crm@nitzanet.co.il>",
  // crm@nitzanet.co.il only sends; replies go to the business (see reply_to_addresses),
  // or to this mailbox when no business address is known.
  emailReplyTo: () => process.env.EMAIL_REPLY_TO ?? "crm.nitzanet@gmail.com",
  // Same sending address, shown under the business's name
  emailFromAs: (name: string) => {
    const from = process.env.EMAIL_FROM ?? "Pulse CRM <crm@nitzanet.co.il>"
    const address = from.match(/<([^>]+)>/)?.[1] ?? from
    return `${name.replace(/["<>\r\n]/g, "").trim() || "Pulse CRM"} <${address}>`
  },
}
