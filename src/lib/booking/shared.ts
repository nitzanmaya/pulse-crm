// Booking helpers shared by the dashboard, the public booking page, the bot
// and the notification sender. Every wall-clock time is Asia/Jerusalem.

export const TZ = "Asia/Jerusalem"

export type ServiceQuestion = {
  id: string
  label: string
  type: "number" | "select" | "text"
  required?: boolean
  min?: number
  max?: number
  options?: string[]
  extra_minutes?: number
  extra_price?: number
}

export type BookableService = {
  id: string
  name: string
  description?: string | null
  duration_minutes: number
  price: number
  color?: string
  questions: ServiceQuestion[]
}

export type Answers = Record<string, string>

// Mirrors private.service_quote: base covers one unit, every extra unit adds extra_minutes / extra_price
export function quote(service: BookableService, answers: Answers = {}) {
  let minutes = Number(service.duration_minutes)
  let price = Number(service.price)
  for (const q of service.questions ?? []) {
    if (q.type !== "number") continue
    const raw = answers[q.id]
    const n = /^[0-9]{1,3}$/.test(raw ?? "") ? Number(raw) : 1
    const extra = Math.max(Math.min(n, q.max ?? 50) - 1, 0)
    minutes += (q.extra_minutes ?? 0) * extra
    price += (q.extra_price ?? 0) * extra
  }
  return { minutes, price }
}

const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
})
const DOW: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

// Wall-clock parts of an instant in Israel
export function localParts(iso: string | Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute), dow: DOW[p.weekday] }
}

// "2026-10-06" + "08:30" (Israel wall clock) -> UTC Date
export function zonedToUtc(day: string, time: string) {
  const [y, m, d] = day.split("-").map(Number)
  const [hh, mm] = time.split(":").map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const offsetAt = (t: number) => {
    const p = localParts(new Date(t))
    const [py, pm, pd] = p.day.split("-").map(Number)
    return Date.UTC(py, pm - 1, pd, p.hour, p.minute) - t
  }
  let t = guess - offsetAt(guess)
  t = guess - offsetAt(t) // second pass settles DST edges
  return new Date(t)
}

export const todayKey = () => localParts(new Date()).day

export const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split("-").map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return dt.toISOString().slice(0, 10)
}

export const dowOf = (day: string) => {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export const fmtTime = (iso: string | Date) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso))

export const fmtDate = (iso: string | Date, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: TZ, ...opts }).format(new Date(iso))

// Day key ("YYYY-MM-DD") rendered for humans; noon UTC keeps it on the same calendar day
export const fmtDay = (day: string, opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" }) =>
  fmtDate(`${day}T12:00:00Z`, opts)

export const WEEKDAYS_HE = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"]
export const WEEKDAYS_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"]

export const minutesLabel = (m: number) => {
  const h = Math.floor(m / 60)
  const r = m % 60
  if (!h) return `${r} דק׳`
  if (!r) return h === 1 ? "שעה" : h === 2 ? "שעתיים" : `${h} שעות`
  return `${h === 1 ? "שעה" : `${h} שעות`} ו-${r} דק׳`
}

// ---------------------------------------------------------------------------
// Message templates
// ---------------------------------------------------------------------------
export type TemplateVars = { name: string; service: string; date: string; time: string; address: string; business: string }

export const TEMPLATE_VARS: { key: keyof TemplateVars; label: string }[] = [
  { key: "name", label: "שם הלקוח" },
  { key: "service", label: "שירות" },
  { key: "date", label: "תאריך" },
  { key: "time", label: "שעה" },
  { key: "address", label: "כתובת" },
  { key: "business", label: "שם העסק" },
]

export function renderTemplate(template: string, vars: TemplateVars) {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, k: string) => (k in vars ? vars[k as keyof TemplateVars] || "" : all))
}

export function templateVars(a: { customer_name: string; service_name: string; starts_at: string; address: string | null; org_name: string }): TemplateVars {
  return {
    name: a.customer_name.split(" ")[0],
    service: a.service_name,
    date: fmtDate(a.starts_at, { weekday: "long", day: "numeric", month: "numeric" }),
    time: fmtTime(a.starts_at),
    address: a.address || "לא צוינה",
    business: a.org_name,
  }
}

// Fallbacks for automations without a custom template (same text the migration seeds)
export const DEFAULT_TEMPLATES = {
  whatsapp_confirmation: "היי {{name}} 👋\nהתור שלך ל{{service}} נקבע ל{{date}} בשעה {{time}}.\nכתובת: {{address}}\nנתראה! {{business}}",
  email_confirmation: "שלום {{name}},\nהתור שלך ל{{service}} נקבע ל{{date}} בשעה {{time}}.\nכתובת: {{address}}\n\nאם משהו משתנה, פשוט השיבו למייל הזה.",
  email_confirmation_subject: "התור שלך ל{{service}} אושר ✓",
  whatsapp_reminder: "תזכורת 🔔 {{name}}, מחר ({{date}}) בשעה {{time}} מגיעים אליך ל{{service}}.\nכתובת: {{address}}\nצריך לשנות? השב/י להודעה הזו.",
  email_reminder: "שלום {{name}},\nרק מזכירים: מחר ({{date}}) בשעה {{time}} נגיע אליך ל{{service}}.\nכתובת: {{address}}",
  email_reminder_subject: "תזכורת: {{service}} מחר בשעה {{time}}",
} as const

// Ready-made services for a quick start
export const EXAMPLE_SERVICES: Omit<BookableService, "id">[] = [
  {
    name: "ניקוי מזגן",
    description: "ניקוי וחיטוי יסודי של פילטרים, מאוורר ומגש ניקוז.",
    duration_minutes: 45,
    price: 250,
    color: "sky",
    questions: [
      { id: "units", label: "כמה מזגנים לנקות?", type: "number", required: true, min: 1, max: 10, extra_minutes: 30, extra_price: 150 },
      { id: "type", label: "סוג המזגן", type: "select", options: ["עילי", "מיני מרכזי", "מרכזי"], required: true },
    ],
  },
  {
    name: "ניקוי ספות",
    description: "ניקוי בשאיבה רטובה והסרת כתמים לכל סוגי הבד.",
    duration_minutes: 60,
    price: 300,
    color: "violet",
    questions: [
      { id: "seats", label: "כמה מושבים?", type: "number", required: true, min: 1, max: 12, extra_minutes: 15, extra_price: 60 },
      { id: "fabric", label: "חומר הריפוד", type: "select", options: ["בד", "עור", "דמוי עור", "לא בטוח/ה"] },
    ],
  },
]

export const SERVICE_COLORS: Record<string, { dot: string; soft: string; text: string; border: string; grad: string }> = {
  rose: { dot: "bg-rose-500", soft: "bg-rose-50", text: "text-rose-700", border: "border-rose-300", grad: "from-rose-400 to-pink-500" },
  sky: { dot: "bg-sky-500", soft: "bg-sky-50", text: "text-sky-700", border: "border-sky-300", grad: "from-sky-400 to-indigo-500" },
  violet: { dot: "bg-violet-500", soft: "bg-violet-50", text: "text-violet-700", border: "border-violet-300", grad: "from-violet-400 to-purple-500" },
  emerald: { dot: "bg-emerald-500", soft: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-300", grad: "from-emerald-400 to-teal-500" },
  amber: { dot: "bg-amber-500", soft: "bg-amber-50", text: "text-amber-700", border: "border-amber-300", grad: "from-amber-400 to-orange-500" },
}
export const serviceColor = (c?: string | null) => SERVICE_COLORS[c ?? "rose"] ?? SERVICE_COLORS.rose

export const googleCalendarLink = (title: string, startIso: string, endIso: string, location?: string) => {
  const f = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "")
  const p = new URLSearchParams({ action: "TEMPLATE", text: title, dates: `${f(startIso)}/${f(endIso)}`, ctz: TZ })
  if (location) p.set("location", location)
  return `https://calendar.google.com/calendar/render?${p}`
}
