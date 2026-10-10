import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { syncPendingAppointments } from "@/lib/calendar/google"

// Called by the dashboard after an appointment is created, moved or cancelled
export async function POST() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  if (!data?.claims) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  try {
    return NextResponse.json(await syncPendingAppointments({ limit: 25 }))
  } catch (e) {
    console.error("Google sync failed", e)
    return NextResponse.json({ error: "sync failed" }, { status: 500 })
  }
}
