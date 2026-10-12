import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import type { BookingResult, Database } from "@/lib/database.types"
import { env } from "@/lib/env"
import { dispatchNotifications } from "@/lib/notify/dispatch"
import { syncPendingAppointments } from "@/lib/calendar/google"

type Body = {
  slug?: string
  serviceId?: string
  startsAt?: string
  answers?: Record<string, string>
  name?: string
  phone?: string
  email?: string
  address?: string
  notes?: string
  lat?: number
  lng?: number
  // Cart: several services in one visit
  items?: { service?: unknown; qty?: unknown }[]
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)

// Public booking: book_appointment validates the slot and enqueues the
// confirmations, then we send them right away instead of waiting for the cron.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Body | null
  const items = Array.isArray(body?.items)
    ? body.items.slice(0, 20).map((i) => ({ service: str(i?.service, 40), qty: typeof i?.qty === "number" ? Math.trunc(i.qty) : 0 }))
    : null
  if (!body?.slug || (!body.serviceId && !items?.length) || !body.startsAt) return NextResponse.json({ error: "bad_request" }, { status: 400 })

  const answers = Object.fromEntries(
    Object.entries(body.answers ?? {}).slice(0, 20).map(([k, v]) => [str(k, 40), str(v, 200)]),
  )

  const supabase = createClient<Database>(env.supabaseUrl(), env.supabaseKey(), { auth: { persistSession: false } })
  // With a location the slot must also pass the distance check, and the
  // coordinates are saved for the next customer's check
  const lat = num(body.lat)
  const lng = lat === null ? null : num(body.lng)
  const { data, error } = items?.length
    ? await supabase.rpc("book_appointment_cart", {
        _slug: str(body.slug, 48),
        _items: items,
        _starts_at: body.startsAt,
        _name: str(body.name, 120),
        _phone: str(body.phone, 32),
        _email: str(body.email, 254) || null,
        _address: str(body.address, 300) || null,
        _notes: str(body.notes, 1000) || null,
        _lat: lng === null ? null : lat,
        _lng: lng,
      })
    : await supabase.rpc("book_appointment_geo", {
        _slug: str(body.slug, 48),
        _service: body.serviceId!,
        _starts_at: body.startsAt,
        _answers: answers,
        _name: str(body.name, 120),
        _phone: str(body.phone, 32),
        _email: str(body.email, 254) || null,
        _address: str(body.address, 300) || null,
        _notes: str(body.notes, 1000) || null,
        _source: "booking_page",
        _lat: lng === null ? null : lat,
        _lng: lng,
      })

  if (error) {
    const code = error.hint === "slot_taken" ? "slot_taken" : error.hint === "below_minimum" ? "below_minimum" : error.code === "22023" ? "invalid" : error.code === "P0002" ? "not_found" : "failed"
    if (code === "failed") console.error("book_appointment_geo failed", error)
    return NextResponse.json({ error: code, message: code === "invalid" ? error.message : undefined }, { status: code === "failed" ? 500 : 409 })
  }

  const booking = data as unknown as BookingResult
  let delivered: string[] = []
  try {
    delivered = (await dispatchNotifications({ appointmentId: booking.id })).delivered
  } catch (e) {
    console.error("instant confirmation failed; the cron will retry", e)
  }
  try {
    await syncPendingAppointments({ appointmentId: booking.id })
  } catch (e) {
    console.error("Google Calendar event failed; the daily job retries", e)
  }
  // The page tells the customer only about messages that really went out
  const sent = { whatsapp: delivered.includes("whatsapp"), email: delivered.includes("email") }

  return NextResponse.json({ ...booking, sent })
}
