// Google Calendar sync, ready for wiring once OAuth credentials exist.
//
// Schema (migration 20261005000000): calendar_connections (one per org calendar,
// incremental sync_token + push channel), private.calendar_credentials (OAuth
// tokens), external_busy (busy blocks pulled from Google that booking slots
// avoid) and appointments.google_event_id / sync_status ('pending' is set by a
// trigger whenever an appointment changes while a connection is active).
//
// To go live:
// 1. Create an OAuth client in Google Cloud (scope calendar.events), set
//    GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, redirect /api/calendar/google/callback.
// 2. Implement the callback: exchange the code, insert calendar_connections
//    (status 'active') and private.calendar_credentials.
// 3. A sync job pushes appointments with sync_status 'pending' (events.insert /
//    patch / delete) and pulls busy times with events.list?syncToken=...

export type CalendarEvent = { id?: string; title: string; start: string; end: string; location?: string; description?: string }

export interface CalendarProvider {
  name: "google"
  configured: boolean
  upsertEvent(calendarId: string, event: CalendarEvent): Promise<{ id: string }>
  deleteEvent(calendarId: string, eventId: string): Promise<void>
  listBusy(calendarId: string, syncToken?: string): Promise<{ busy: { id: string; start: string; end: string }[]; nextSyncToken?: string }>
}

const notConfigured = (): never => {
  throw new Error("Google Calendar is not connected yet (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)")
}

export const googleCalendar: CalendarProvider = {
  name: "google",
  configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
  upsertEvent: async () => notConfigured(),
  deleteEvent: async () => notConfigured(),
  listBusy: async () => notConfigured(),
}
