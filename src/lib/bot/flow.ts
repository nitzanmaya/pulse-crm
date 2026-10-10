// WhatsApp booking bot as a pure, channel-agnostic state machine.
// The dashboard simulator drives it today; a WhatsApp webhook can drive the
// same function later (state per phone number, ctx.book -> book_appointment).
//
// greeting -> service -> follow-up questions (quantity...) -> day -> time ->
// address -> email (optional) -> summary -> booked (calendar confirmation)

import { quote, localParts, fmtTime, fmtDay, WEEKDAYS_HE, minutesLabel, type Answers, type BookableService } from "@/lib/booking/shared"
import { DEFAULT_BOT_TEXTS, fill, type BotTextKey, type BotTexts } from "@/lib/bot/texts"

export type Slot = { start: string; end: string }
export type BotOption = { id: string; label: string; description?: string }
export type BotCard = { title: string; lines: string[] }
export type BotMessage = { text: string; options?: BotOption[]; card?: BotCard }
export type BotStep = "service" | "question" | "day" | "time" | "address" | "email" | "confirm" | "done"

export type BotState = {
  step: BotStep
  options: BotOption[]
  serviceId?: string
  qIndex: number
  answers: Answers
  slots?: Slot[]
  day?: string
  slot?: Slot
  address?: string
  email?: string
}

export type BotContext = {
  orgName: string
  services: BookableService[]
  getSlots: (service: BookableService, answers: Answers) => Promise<Slot[]>
  // Real bookings (webhook); the simulator leaves it out
  book?: (s: { service: BookableService; answers: Answers; slot: Slot; address: string; email?: string }) => Promise<{ ok: boolean; id?: string; error?: string }>
  // Scripts edited in the admin (defaults in texts.ts)
  texts?: BotTexts
  customerName?: string
}

export type BotEvent = { kind: "slots" | "booked" | "simulated" | "reminder" | "faq" | "handoff"; text: string }
export type BotTurn = { state: BotState; messages: BotMessage[]; events: BotEvent[]; appointmentId?: string }

export const BOT_STEPS: { id: string; label: string; steps: (BotStep | "greeting")[] }[] = [
  { id: "greeting", label: "פתיחה", steps: ["greeting"] },
  { id: "service", label: "בחירת שירות", steps: ["service"] },
  { id: "question", label: "שאלות כמות", steps: ["question"] },
  { id: "time", label: "בחירת מועד", steps: ["day", "time"] },
  { id: "address", label: "כתובת ומייל", steps: ["address", "email"] },
  { id: "confirm", label: "אישור ביומן", steps: ["confirm", "done"] },
]

const ils = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase()

function match(options: BotOption[], input: { text?: string; optionId?: string }) {
  if (input.optionId) return options.find((o) => o.id === input.optionId) ?? null
  const t = norm(input.text ?? "")
  if (!t) return null
  if (/^\d{1,2}$/.test(t)) {
    const byLabel = options.find((o) => norm(o.label) === t)
    if (byLabel) return byLabel
    return options[Number(t) - 1] ?? null
  }
  return options.find((o) => norm(o.label) === t) ?? options.find((o) => t.length >= 2 && norm(o.label).includes(t)) ?? null
}

const serviceOf = (ctx: BotContext, s: BotState) => ctx.services.find((x) => x.id === s.serviceId)!

const say = (ctx: BotContext, key: BotTextKey, vars: Record<string, string | undefined> = {}) =>
  fill((ctx.texts ?? DEFAULT_BOT_TEXTS)[key], { name: ctx.customerName?.split(" ")[0], business: ctx.orgName, ...vars })

function askService(ctx: BotContext, state: BotState): BotMessage {
  state.step = "service"
  state.options = ctx.services.map((s) => ({ id: s.id, label: `${s.name} · ${ils(s.price)}` }))
  return { text: say(ctx, "service_prompt"), options: state.options }
}

function askQuestion(ctx: BotContext, state: BotState): BotMessage | null {
  const q = serviceOf(ctx, state).questions[state.qIndex]
  if (!q) return null
  state.step = "question"
  if (q.type === "number") {
    const min = q.min ?? 1
    const max = Math.min(q.max ?? 10, min + 5)
    state.options = Array.from({ length: max - min + 1 }, (_, i) => ({ id: String(min + i), label: String(min + i) }))
    return { text: `${q.label}\nאפשר לבחור או לכתוב מספר 🔢`, options: state.options }
  }
  if (q.type === "select") {
    state.options = (q.options ?? []).map((o) => ({ id: o, label: o }))
    return { text: q.label, options: state.options }
  }
  state.options = []
  return { text: q.label }
}

async function askDay(ctx: BotContext, state: BotState, events: BotEvent[]): Promise<BotMessage[]> {
  const service = serviceOf(ctx, state)
  const slots = state.slots ?? (await ctx.getSlots(service, state.answers))
  state.slots = slots
  const days = [...new Set(slots.map((s) => localParts(s.start).day))].slice(0, 6)
  if (!state.slots.length) {
    state.step = "done"
    state.options = [{ id: "restart", label: "התחלה מחדש" }]
    return [{ text: say(ctx, "no_slots"), options: state.options }]
  }
  events.push({ kind: "slots", text: `נבדקו שעות פנויות ביומן: ${slots.length} אפשרויות ב-${days.length} ימים` })
  state.step = "day"
  state.options = days.map((d) => ({ id: d, label: `${WEEKDAYS_HE[localParts(`${d}T12:00:00Z`).dow]} ${fmtDay(d, { day: "numeric", month: "numeric" })}` }))
  return [{ text: say(ctx, "day_prompt", { service: service.name }), options: state.options }]
}

function askTime(ctx: BotContext, state: BotState): BotMessage {
  const daySlots = (state.slots ?? []).filter((s) => localParts(s.start).day === state.day)
  // Spread up to 8 choices across the day
  const step = Math.max(1, Math.floor(daySlots.length / 8))
  const picks = daySlots.filter((_, i) => i % step === 0).slice(0, 8)
  state.step = "time"
  state.options = [...picks.map((s) => ({ id: s.start, label: fmtTime(s.start) })), { id: "back", label: "↩️ יום אחר" }]
  return { text: say(ctx, "time_prompt", { date: fmtDay(state.day!, { weekday: "long", day: "numeric", month: "numeric" }), service: serviceOf(ctx, state).name }), options: state.options }
}

// Optional: lets the reminder go out by email; anyone can skip it
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const SKIP_WORDS = ["דלג", "דילוג", "אין", "אין לי", "לא", "בלי", "skip"]

function askEmail(state: BotState): BotMessage {
  state.step = "email"
  state.options = [{ id: "skip", label: "דלג ⏭️" }]
  return { text: "📧 רוצה גם תזכורת במייל לפני הביקור?\nאפשר לכתוב כאן את כתובת המייל, או ללחוץ ״דלג״ ולהמשיך.", options: state.options }
}

function summary(ctx: BotContext, state: BotState): BotMessage[] {
  const service = serviceOf(ctx, state)
  const q = quote(service, state.answers)
  const extras = service.questions.filter((x) => state.answers[x.id]).map((x) => `${x.label.replace(/\?$/, "")}: ${state.answers[x.id]}`)
  state.step = "confirm"
  state.options = [{ id: "yes", label: "✅ אישור וקביעת התור" }, { id: "change", label: "✏️ שינוי מועד" }]
  return [{
    text: say(ctx, "summary_intro"),
    card: {
      title: service.name,
      lines: [
        `🗓️ ${fmtDay(state.day!, { weekday: "long", day: "numeric", month: "long" })} · ${fmtTime(state.slot!.start)}`,
        `📍 ${state.address}`,
        ...(state.email ? [`📧 ${state.email}`] : []),
        ...extras.map((e) => `• ${e}`),
        `⏱️ ${minutesLabel(q.minutes)} · 💰 ${ils(q.price)}`,
      ],
    },
    options: state.options,
  }]
}

// Entry point used by the engine's "book" menu item
export function startBooking(ctx: BotContext): BotTurn {
  const state: BotState = { step: "service", options: [], qIndex: 0, answers: {} }
  return { state, messages: [askService(ctx, state)], events: [] }
}

export function greeting(ctx: BotContext): BotTurn {
  const state: BotState = { step: "service", options: [], qIndex: 0, answers: {} }
  return {
    state,
    messages: [
      { text: `היי! 👋 כאן הבוט של ${ctx.orgName}.\nאני אעזור לך לקבוע תור תוך פחות מדקה.` },
      askService(ctx, state),
    ],
    events: [],
  }
}

export async function botTurn(prev: BotState, input: { text?: string; optionId?: string }, ctx: BotContext): Promise<BotTurn> {
  const state: BotState = { ...prev, answers: { ...prev.answers } }
  const events: BotEvent[] = []
  let appointmentId: string | undefined
  const reply = (...messages: BotMessage[]): BotTurn => ({ state, messages, events, appointmentId })
  const t = norm(input.text ?? "")

  if (["התחלה", "תפריט", "שלום", "היי", "restart"].includes(t) || input.optionId === "restart") return greeting(ctx)

  const retry = () => reply({ text: say(ctx, "retry"), options: state.options })

  switch (state.step) {
    case "service": {
      const o = match(state.options, input)
      if (!o) return retry()
      state.serviceId = o.id
      state.qIndex = 0
      state.answers = {}
      state.slots = undefined
      const q = askQuestion(ctx, state)
      const service = serviceOf(ctx, state)
      const intro: BotMessage = { text: `מעולה, ${service.name} 🙌${service.description ? `\n${service.description}` : ""}` }
      return q ? reply(intro, q) : reply(intro, ...(await askDay(ctx, state, events)))
    }
    case "question": {
      const service = serviceOf(ctx, state)
      const q = service.questions[state.qIndex]
      let value: string | null = null
      if (q.type === "number") {
        const n = Number((input.optionId ?? input.text ?? "").replace(/[^\d]/g, ""))
        if (n >= (q.min ?? 1) && n <= (q.max ?? 50)) value = String(n)
        else return reply({ text: `צריך מספר בין ${q.min ?? 1} ל-${q.max ?? 50} 🙂`, options: state.options })
      } else if (q.type === "select") {
        value = match(state.options, input)?.label ?? null
        if (!value) return retry()
      } else {
        value = (input.text ?? "").trim()
        if (!value) return reply({ text: q.label })
      }
      state.answers[q.id] = value
      state.qIndex += 1
      const next = askQuestion(ctx, state)
      if (next) return reply(next)
      const qq = quote(service, state.answers)
      return reply({ text: `רשמתי ✍️ משך משוער ${minutesLabel(qq.minutes)}, מחיר ${ils(qq.price)}.` }, ...(await askDay(ctx, state, events)))
    }
    case "day": {
      const o = match(state.options, input)
      if (!o) return retry()
      state.day = o.id
      return reply(askTime(ctx, state))
    }
    case "time": {
      const o = match(state.options, input)
      if (!o) return retry()
      if (o.id === "back") return reply(...(await askDay(ctx, state, events)))
      state.slot = state.slots!.find((s) => s.start === o.id)
      state.step = "address"
      state.options = []
      return reply({ text: say(ctx, "address_prompt", { time: fmtTime(state.slot!.start), date: fmtDay(state.day!, { weekday: "long", day: "numeric", month: "numeric" }) }) })
    }
    case "address": {
      const a = (input.text ?? "").trim()
      if (a.length < 4) return reply({ text: "אפשר כתובת מלאה? למשל: הרצל 12, רמת גן 🏠" })
      state.address = a
      return reply(askEmail(state))
    }
    case "email": {
      const e = (input.text ?? "").trim().replace(/\s+/g, "")
      if (input.optionId === "skip" || SKIP_WORDS.includes(t)) {
        state.email = undefined
        return reply(...summary(ctx, state))
      }
      if (!EMAIL_RE.test(e)) return reply({ text: "נראה שחסר משהו בכתובת 🙈 למשל: dana@gmail.com\nאפשר גם לדלג.", options: state.options })
      state.email = e.toLowerCase()
      return reply(...summary(ctx, state))
    }
    case "confirm": {
      const o = match(state.options, input)
      if (!o) return retry()
      if (o.id === "change") return reply(...(await askDay(ctx, state, events)))
      const service = serviceOf(ctx, state)
      if (ctx.book) {
        const r = await ctx.book({ service, answers: state.answers, slot: state.slot!, address: state.address!, email: state.email })
        if (!r.ok) {
          state.slots = undefined
          return reply({ text: say(ctx, "slot_taken") }, ...(await askDay(ctx, state, events)))
        }
        appointmentId = r.id
        events.push({ kind: "booked", text: "נוצר תור ביומן ונקשר לכרטיס הלקוח" })
      } else {
        events.push({ kind: "simulated", text: "סימולציה: בבוט האמיתי כאן נוצר תור ביומן ונפתח ליד" })
      }
      if (state.email) {
        const remind = new Date(new Date(state.slot!.start).getTime() - 24 * 3600 * 1000)
        events.push({ kind: "reminder", text: `תזכורת במייל תתוזמן ל-${fmtDay(localParts(remind).day, { day: "numeric", month: "numeric" })} ${fmtTime(remind)}` })
      }
      state.step = "done"
      state.options = [{ id: "restart", label: "קביעת תור נוסף" }]
      return reply(
        {
          text: "",
          card: {
            title: "✅ התור נקבע ונוסף ליומן",
            lines: [
              `${service.name} · ${ctx.orgName}`,
              `${fmtDay(state.day!, { weekday: "long", day: "numeric", month: "long" })} · ${fmtTime(state.slot!.start)} עד ${fmtTime(state.slot!.end)}`,
              `📍 ${state.address}`,
            ],
          },
        },
        {
          text: [
            say(ctx, "confirmed", { service: service.name, date: fmtDay(state.day!, { weekday: "long", day: "numeric", month: "long" }), time: fmtTime(state.slot!.start) }),
            state.email && `📧 יום לפני הביקור נשלח תזכורת ל-${state.email}`,
          ].filter(Boolean).join("\n"),
          options: state.options,
        },
      )
    }
    default: {
      return reply({ text: "רוצה לקבוע תור נוסף? 😊", options: [{ id: "restart", label: "קביעת תור נוסף" }] })
    }
  }
}
