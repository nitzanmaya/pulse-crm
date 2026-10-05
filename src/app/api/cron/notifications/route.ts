import { NextResponse, type NextRequest } from "next/server"
import { env } from "@/lib/env"
import { dispatchNotifications } from "@/lib/notify/dispatch"

// Sends due booking notifications (confirmations that missed the instant send, reminders).
// With a once-a-day cron, NOTIFY_LOOKAHEAD_HOURS=12 (default) sends each reminder
// at the run closest to its time, i.e. 12-36 hours before a "24 hours before" visit.
// With a frequent cron (Vercel Pro / external pinger) set it to 0 for exact timing.
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${env.cronSecret()}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  const lookaheadMinutes = Math.round(Number(process.env.NOTIFY_LOOKAHEAD_HOURS ?? 12) * 60) || 0
  try {
    return NextResponse.json(await dispatchNotifications({ lookaheadMinutes }))
  } catch (e) {
    console.error("notification dispatch failed", e)
    return NextResponse.json({ error: "dispatch failed" }, { status: 500 })
  }
}
