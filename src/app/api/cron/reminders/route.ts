import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import type { Database } from "@/lib/database.types"
import { env } from "@/lib/env"
import { reminderEmail } from "@/lib/email/reminders"

// Daily job (see vercel.json crons): birthday greetings and service reminders.
// claim_due_reminders logs each item before returning it, so a re-run never double-sends.
export async function GET(request: NextRequest) {
  const secret = env.cronSecret()
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const supabase = createClient<Database>(env.supabaseUrl(), env.supabaseKey(), { auth: { persistSession: false } })
  const { data: due, error } = await supabase.rpc("claim_due_reminders", { _secret: secret })
  if (error) {
    console.error("claim_due_reminders failed", error)
    return NextResponse.json({ error: "claim failed" }, { status: 500 })
  }
  if (!due?.length) return NextResponse.json({ sent: 0 })

  const resend = new Resend(env.resendKey())
  const emails = due.map((r) => ({ from: env.emailFrom(), to: r.email, ...reminderEmail(r) }))
  let sent = 0
  // Resend batch accepts up to 100 emails per call
  for (let i = 0; i < emails.length; i += 100) {
    const { error: sendError } = await resend.batch.send(emails.slice(i, i + 100))
    if (sendError) console.error("reminder batch failed", sendError)
    else sent += Math.min(100, emails.length - i)
  }

  return NextResponse.json({ sent, birthdays: due.filter((r) => r.kind === "birthday").length, services: due.filter((r) => r.kind === "service").length })
}
