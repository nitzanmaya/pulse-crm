// Google Calendar API, called directly (no SDK).
//
// Connection: an org admin clicks "connect" (/api/calendar/google/connect),
// Google redirects back to /api/calendar/google/callback, and the refresh
// token is stored in private.calendar_credentials via a secret-guarded RPC.
//
// - getAvailableSlots: free slots from the CRM (work days, hours, slot length,
//   buffer, blocked days, existing appointments) minus busy times in Google.
// - createCalendarEvent: writes the appointment to Google and records the
//   event id on the appointment (sync_status 'synced').
// - syncPendingAppointments: pushes every appointment a trigger marked
//   'pending' (new, moved, cancelled), e.g. ones created in the dashboard.
//
// Env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXT_PUBLIC_SITE_URL, CRON_SECRET.

import { createHmac, timingSafeEqual } from "node:crypto"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"
import { env } from "@/lib/env"
import { TZ, zonedToUtc, addDays, type Answers } from "@/lib/booking/shared"

const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
]
const API = "https://www.googleapis.com/calendar/v3"

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.CRON_SECRET)
export const redirectUri = () => `${env.siteUrl().replace(/\/$/, "")}/api/calendar/google/callback`

type Db = SupabaseClient<Database>
const serverDb = (): Db => createClient<Database>(env.supabaseUrl(), env.supabaseKey(), { auth: { persistSession: false } })
const secret = () => env.cronSecret()

export type Slot = { start: string; end: string }
export type EventDetails = {
  appointmentId?: string
  orgId: string
  title: string
  start: string
  end: string
  location?: string | null
  description?: string | null
  googleEventId?: string | null
}

/* ------------------------------- OAuth ------------------------------- */

// state = base64url(payload).hmac, so the callback knows which org and user started it
export function signState(payload: { org: string; user: string }) {
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 15 * 60_000 })).toString("base64url")
  return `${body}.${createHmac("sha256", secret()).update(body).digest("base64url")}`
}

export function readState(state: string | null): { org: string; user: string } | null {
  const [body, sig] = (state ?? "").split(".")
  if (!body || !sig) return null
  const expected = Buffer.from(createHmac("sha256", secret()).update(body).digest("base64url"))
  const got = Buffer.from(sig)
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return null
  const data = JSON.parse(Buffer.from(body, "base64url").toString()) as { org: string; user: string; exp: number }
  return data.exp > Date.now() ? { org: data.org, user: data.user } : null
}

export function authUrl(state: string) {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; id_token?: string; error?: string; error_description?: string }

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }),
  })
  const json = (await res.json()) as TokenResponse
  if (!res.ok) throw new Error(json.error_description || json.error || `Google token HTTP ${res.status}`)
  return json
}

// Exchanges the callback code and stores the connection for the org
export async function connectFromCode(code: string, org: string, user: string) {
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() })
  if (!t.refresh_token) throw new Error("Google did not return a refresh token")
  const email = t.id_token ? (JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString()) as { email?: string }).email : undefined
  const { error } = await serverDb().rpc("calendar_store_connection", {
    _secret: secret(),
    _org: org,
    _user: user,
    _email: email ?? null,
    _calendar_id: "primary",
    _refresh_token: t.refresh_token,
    _access_token: t.access_token,
    _expires_at: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
  })
  if (error) throw error
  return { email }
}

// Valid access token for the org's connected calendar, refreshed when needed; null when not connected
async function access(db: Db, orgId: string): Promise<{ token: string; calendarId: string; connectionId: string } | null> {
  if (!googleConfigured()) return null
  const { data, error } = await db.rpc("calendar_get_access", { _secret: secret(), _org: orgId })
  if (error) throw error
  const c = data?.[0]
  if (!c) return null
  if (c.access_token && c.expires_at && new Date(c.expires_at).getTime() > Date.now() + 30_000) {
    return { token: c.access_token, calendarId: c.calendar_id, connectionId: c.connection_id }
  }
  try {
    const t = await tokenRequest({ refresh_token: c.refresh_token, grant_type: "refresh_token" })
    const expires = new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString()
    await db.rpc("calendar_save_access", { _secret: secret(), _connection: c.connection_id, _access_token: t.access_token, _expires_at: expires })
    return { token: t.access_token, calendarId: c.calendar_id, connectionId: c.connection_id }
  } catch (e) {
    // Revoked or expired consent: mark the connection so the admin reconnects
    const message = e instanceof Error ? e.message : String(e)
    await db.rpc("calendar_save_access", { _secret: secret(), _connection: c.connection_id, _access_token: null, _expires_at: null, _error: message })
    throw e
  }
}

async function gfetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers } })
  if (res.status === 204 || res.status === 410) return undefined as T
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } }
  if (!res.ok) throw new Error(json.error?.message ?? `Google Calendar HTTP ${res.status}`)
  return json
}

/* --------------------------- availability --------------------------- */

async function busyTimes(token: string, calendarId: string, from: string, to: string) {
  const r = await gfetch<{ calendars: Record<string, { busy?: { start: string; end: string }[] }> }>(token, "/freeBusy", {
    method: "POST",
    body: JSON.stringify({ timeMin: from, timeMax: to, timeZone: TZ, items: [{ id: calendarId }] }),
  })
  return (r.calendars[calendarId]?.busy ?? []).map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))
}

// Free slots for a service on one day (date = YYYY-MM-DD, Israel time) or the
// next `days` days. Google busy times are removed when a calendar is connected;
// if Google can't be reached the CRM slots are returned as they are.
export async function getAvailableSlots(opts: {
  slug: string
  orgId: string
  serviceId: string
  answers?: Answers
  date?: string
  days?: number
  db?: Db
}): Promise<Slot[]> {
  const db = opts.db ?? serverDb()
  const days = opts.date ? 1 : (opts.days ?? 14)
  const { data, error } = await db.rpc("get_booking_slots", {
    _slug: opts.slug,
    _service: opts.serviceId,
    _answers: opts.answers ?? {},
    _from: opts.date ?? null,
    _days: days,
  })
  if (error) throw error
  const slots = (data ?? []).map((s) => ({ start: s.slot_start, end: s.slot_end }))
  if (!slots.length) return slots

  try {
    const a = await access(db, opts.orgId)
    if (!a) return slots
    const from = opts.date ? zonedToUtc(opts.date, "00:00").toISOString() : slots[0].start
    const to = opts.date ? zonedToUtc(addDays(opts.date, 1), "00:00").toISOString() : slots.at(-1)!.end
    const busy = await busyTimes(a.token, a.calendarId, from, to)
    return slots.filter((s) => {
      const start = Date.parse(s.start)
      const end = Date.parse(s.end)
      return !busy.some((b) => b.start < end && b.end > start)
    })
  } catch (e) {
    console.error("Google free/busy failed, using CRM availability only", e)
    return slots
  }
}

/* ------------------------------ events ------------------------------ */

// Creates (or updates, when googleEventId is set) the event in Google
export async function createCalendarEvent(details: EventDetails, db: Db = serverDb()): Promise<{ id: string } | null> {
  const a = await access(db, details.orgId)
  if (!a) return null
  const body = {
    summary: details.title,
    location: details.location ?? undefined,
    description: details.description ?? undefined,
    start: { dateTime: details.start, timeZone: TZ },
    end: { dateTime: details.end, timeZone: TZ },
    extendedProperties: details.appointmentId ? { private: { pulseAppointmentId: details.appointmentId } } : undefined,
    reminders: { useDefault: true },
  }
  const cal = encodeURIComponent(a.calendarId)
  const event = details.googleEventId
    ? await gfetch<{ id: string }>(a.token, `/calendars/${cal}/events/${encodeURIComponent(details.googleEventId)}`, { method: "PATCH", body: JSON.stringify(body) })
    : await gfetch<{ id: string }>(a.token, `/calendars/${cal}/events`, { method: "POST", body: JSON.stringify(body) })
  if (details.appointmentId) await db.rpc("calendar_mark_synced", { _secret: secret(), _appointment: details.appointmentId, _event_id: event.id })
  return event
}

export async function deleteCalendarEvent(orgId: string, eventId: string, db: Db = serverDb()) {
  const a = await access(db, orgId)
  if (!a) return
  await gfetch(a.token, `/calendars/${encodeURIComponent(a.calendarId)}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" })
}

// Pushes appointments waiting for sync. Pass appointmentId to sync just one.
export async function syncPendingAppointments(opts: { appointmentId?: string; limit?: number } = {}) {
  if (!googleConfigured()) return { synced: 0, failed: 0, skipped: "google not configured" }
  const db = serverDb()
  const { data, error } = await db.rpc("calendar_pending_events", { _secret: secret(), _appointment: opts.appointmentId ?? null, _limit: opts.limit ?? 50 })
  if (error) throw error
  let synced = 0
  let failed = 0
  for (const a of data ?? []) {
    try {
      if (a.status === "cancelled" || a.status === "no_show") {
        if (a.google_event_id) await deleteCalendarEvent(a.org_id, a.google_event_id, db)
        await db.rpc("calendar_mark_synced", { _secret: secret(), _appointment: a.appointment_id, _event_id: a.google_event_id })
      } else {
        const answers = Object.entries((a.answers ?? {}) as Record<string, string>).map(([k, v]) => `${k}: ${v}`)
        await createCalendarEvent(
          {
            appointmentId: a.appointment_id,
            orgId: a.org_id,
            googleEventId: a.google_event_id,
            title: `${a.service_name ?? "תור"} · ${a.customer_name}`,
            start: a.starts_at,
            end: a.ends_at,
            location: a.address,
            description: [`לקוח: ${a.customer_name}`, a.phone && `טלפון: ${a.phone}`, ...answers, a.notes, `נקבע דרך ${a.org_name} · Pulse CRM`].filter(Boolean).join("\n"),
          },
          db,
        )
      }
      synced++
    } catch (e) {
      failed++
      const message = e instanceof Error ? e.message : String(e)
      await db.rpc("calendar_mark_synced", { _secret: secret(), _appointment: a.appointment_id, _event_id: null, _error: message })
    }
  }
  return { synced, failed }
}
