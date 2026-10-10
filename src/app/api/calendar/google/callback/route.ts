import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { connectFromCode, readState, syncPendingAppointments } from "@/lib/calendar/google"

// Google redirects here after consent; stores the connection and pushes upcoming appointments
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const back = new URL("/dashboard", request.url)
  const state = readState(q.get("state"))
  const code = q.get("code")

  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!state || !code || data?.claims.sub !== state.user) {
    back.searchParams.set("calendar", q.get("error") === "access_denied" ? "denied" : "failed")
    return NextResponse.redirect(back)
  }

  try {
    await connectFromCode(code, state.org, state.user)
    back.searchParams.set("calendar", "connected")
  } catch (e) {
    console.error("Google Calendar connect failed", e)
    back.searchParams.set("calendar", "failed")
    return NextResponse.redirect(back)
  }
  try {
    await syncPendingAppointments({ limit: 100 })
  } catch (e) {
    console.error("initial Google sync failed; the daily job retries", e)
  }
  return NextResponse.redirect(back)
}
