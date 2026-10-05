import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import type { Database, NotificationJobClaim } from "@/lib/database.types"
import { env } from "@/lib/env"
import { DEFAULT_TEMPLATES, fmtDate, fmtTime, renderTemplate, templateVars } from "@/lib/booking/shared"
import { bookingEmailHtml } from "@/lib/notify/booking-email"
import { whatsappProvider } from "@/lib/notify/whatsapp"

type Result = { id: string; status: "sent" | "simulated" | "failed"; provider: string; provider_message_id?: string; error?: string; content?: string }

// Claims due notification jobs, sends them (Resend / WhatsApp provider) and records the outcome.
// Without CRON_SECRET nothing is claimed; jobs stay queued for a later run.
export async function dispatchNotifications({ appointmentId, lookaheadMinutes = 0 }: { appointmentId?: string; lookaheadMinutes?: number } = {}) {
  const secret = process.env.CRON_SECRET
  if (!secret) return { claimed: 0, sent: 0, delivered: [] as string[], skipped: "CRON_SECRET missing" }

  const supabase = createClient<Database>(env.supabaseUrl(), env.supabaseKey(), { auth: { persistSession: false } })
  const { data: jobs, error } = await supabase.rpc("claim_notification_jobs", {
    _secret: secret,
    _lookahead_minutes: lookaheadMinutes,
    _appointment: appointmentId ?? null,
  })
  if (error) throw error
  if (!jobs?.length) return { claimed: 0, sent: 0, delivered: [] as string[] }

  const wa = whatsappProvider()
  const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null
  const results = await Promise.all(jobs.map((job) => sendOne(job, wa, resend)))

  const { error: finishError } = await supabase.rpc("finish_notification_jobs", { _secret: secret, _results: results })
  if (finishError) console.error("finish_notification_jobs failed", finishError)

  return {
    claimed: jobs.length,
    sent: results.filter((r) => r.status === "sent").length,
    simulated: results.filter((r) => r.status === "simulated").length,
    failed: results.filter((r) => r.status === "failed").length,
    // Channels that really reached the customer
    delivered: jobs.filter((_, i) => results[i].status === "sent").map((j) => j.channel as string),
  }
}

async function sendOne(job: NotificationJobClaim, wa: ReturnType<typeof whatsappProvider>, resend: Resend | null): Promise<Result> {
  const vars = templateVars(job)
  const kind = job.kind
  try {
    if (job.channel === "whatsapp") {
      if (!job.phone) return { id: job.job_id, status: "failed", provider: wa.name, error: "no phone" }
      const text = renderTemplate(job.template || DEFAULT_TEMPLATES[`whatsapp_${kind}`], vars)
      const r = await wa.send({ to: job.phone, text, kind, vars })
      if (!r.ok) return { id: job.job_id, status: "failed", provider: r.provider, error: r.error }
      return { id: job.job_id, status: r.simulated ? "simulated" : "sent", provider: r.provider, provider_message_id: r.id, content: text }
    }

    if (!job.email) return { id: job.job_id, status: "failed", provider: "resend", error: "no email" }
    if (!resend) return { id: job.job_id, status: "failed", provider: "resend", error: "RESEND_API_KEY missing" }
    const text = renderTemplate(job.template || DEFAULT_TEMPLATES[`email_${kind}`], vars)
    const subject = renderTemplate(job.subject || DEFAULT_TEMPLATES[`email_${kind}_subject`], vars)
    const when = `${fmtDate(job.starts_at)} · ${fmtTime(job.starts_at)}`
    const { data, error } = await resend.emails.send({
      from: env.emailFrom(),
      to: job.email,
      subject,
      text,
      html: bookingEmailHtml({ kind, text, org: job.org_name, when, service: job.service_name }),
    })
    if (error) return { id: job.job_id, status: "failed", provider: "resend", error: error.message }
    return { id: job.job_id, status: "sent", provider: "resend", provider_message_id: data?.id, content: `${subject}\n${text}` }
  } catch (e) {
    return { id: job.job_id, status: "failed", provider: job.channel === "whatsapp" ? wa.name : "resend", error: e instanceof Error ? e.message : String(e) }
  }
}
