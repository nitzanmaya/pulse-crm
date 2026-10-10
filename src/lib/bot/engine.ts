// Conversation engine on top of the booking flow (flow.ts): welcome menu,
// FAQ triggers, handoff to a human agent and the conversation states stored
// in bot_conversations. Pure: the webhook and the dashboard simulator both
// call engineTurn, only the BotContext (slots, booking) differs.

import { botTurn, startBooking, type BotContext, type BotEvent, type BotMessage, type BotOption, type BotState } from "@/lib/bot/flow"
import { fill, type BotTexts } from "@/lib/bot/texts"

export const CONVERSATION_STATES = [
  "WELCOME",
  "FAQ",
  "SERVICE_SELECT",
  "SERVICE_QUESTIONS",
  "DATE_SELECT",
  "TIME_SELECT",
  "ADDRESS",
  "CONFIRM",
  "CONFIRMED",
] as const
export type ConversationState = (typeof CONVERSATION_STATES)[number]
export type ConversationMode = "bot" | "manual_agent"

export const STATE_LABELS: Record<ConversationState, string> = {
  WELCOME: "תפריט פתיחה",
  FAQ: "שאלות נפוצות",
  SERVICE_SELECT: "בחירת שירות",
  SERVICE_QUESTIONS: "שאלות על השירות",
  DATE_SELECT: "בחירת יום",
  TIME_SELECT: "בחירת שעה",
  ADDRESS: "כתובת",
  CONFIRM: "אישור סיכום",
  CONFIRMED: "תור נקבע",
}

export type MenuItem = { id: string; label: string; description?: string | null; action: "book" | "faqs" | "faq" | "handoff" | "reply"; faq_id?: string | null; reply?: string | null }
export type Faq = { id: string; question: string; answer: string; keywords: string[] }

export type EngineContext = {
  flow: BotContext
  texts: BotTexts
  menu: MenuItem[]
  faqs: Faq[]
  handoffKeywords: string[]
  restartKeywords: string[]
}

export type EngineContextData = {
  flow?: BotState
  options?: BotOption[]
  at?: string
}

export type Conversation = { state: ConversationState; mode: ConversationMode; context: EngineContextData }
export type EngineTurn = Conversation & { messages: BotMessage[]; events: BotEvent[]; appointmentId?: string }

// A conversation idle for this long starts over at the welcome menu
const STALE_MS = 12 * 3600 * 1000

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase()

const STEP_STATE: Record<BotState["step"], ConversationState> = {
  service: "SERVICE_SELECT",
  question: "SERVICE_QUESTIONS",
  day: "DATE_SELECT",
  time: "TIME_SELECT",
  address: "ADDRESS",
  email: "ADDRESS",
  confirm: "CONFIRM",
  done: "CONFIRMED",
}

const hasKeyword = (text: string, words: string[]) => {
  const t = ` ${norm(text)} `
  return words.some((w) => w.trim() && t.includes(` ${norm(w)} `))
}

export function matchFaq(text: string, faqs: Faq[]): Faq | null {
  const t = norm(text)
  if (t.length < 2) return null
  let best: { faq: Faq; score: number } | null = null
  for (const f of faqs) {
    if (norm(f.question) === t) return f
    const score = f.keywords.filter((k) => k.trim() && t.includes(norm(k))).length
    if (score && (!best || score > best.score)) best = { faq: f, score }
  }
  return best?.faq ?? null
}

function pick(options: BotOption[] | undefined, input: { text?: string; optionId?: string }) {
  if (!options?.length) return null
  if (input.optionId) return options.find((o) => o.id === input.optionId) ?? null
  const t = norm(input.text ?? "")
  if (!t) return null
  if (/^\d{1,2}$/.test(t)) return options[Number(t) - 1] ?? null
  const clean = (s: string) => norm(s).replace(/^[^\p{L}\p{N}]+/u, "")
  return options.find((o) => clean(o.label) === clean(t)) ?? options.find((o) => t.length >= 3 && clean(o.label).includes(clean(t))) ?? null
}

const menuOptions = (ctx: EngineContext): BotOption[] => ctx.menu.map((m) => ({ id: `menu:${m.id}`, label: m.label, description: m.description ?? undefined }))
const faqOptions = (ctx: EngineContext): BotOption[] => [...ctx.faqs.map((f) => ({ id: `faq:${f.id}`, label: f.question })), { id: "menu", label: "↩️ לתפריט" }]

const say = (ctx: EngineContext, key: keyof BotTexts) =>
  fill(ctx.texts[key], { name: ctx.flow.customerName?.split(" ")[0], business: ctx.flow.orgName })

function welcome(ctx: EngineContext, lead?: BotMessage[]): EngineTurn {
  const options = menuOptions(ctx)
  return {
    state: "WELCOME",
    mode: "bot",
    context: { options, at: new Date().toISOString() },
    messages: [...(lead ?? []), { text: say(ctx, "welcome"), options }],
    events: [],
  }
}

const handoff = (ctx: EngineContext, conv: Conversation): EngineTurn => ({
  state: conv.state,
  mode: "manual_agent",
  context: { ...conv.context, at: new Date().toISOString() },
  messages: [{ text: say(ctx, "handoff") }],
  events: [{ kind: "handoff", text: "השיחה הועברה לנציג. הבוט מושתק לאיש הקשר הזה עד שיוחזר" }],
})

function answerFaq(ctx: EngineContext, faq: Faq, back: { state: ConversationState; context: EngineContextData }, lastOptions?: BotOption[]): EngineTurn {
  const options = lastOptions?.length ? lastOptions : menuOptions(ctx)
  return {
    state: back.state,
    mode: "bot",
    context: { ...back.context, options, at: new Date().toISOString() },
    messages: [{ text: faq.answer }, { text: lastOptions?.length ? "נמשיך מאיפה שעצרנו 👇" : say(ctx, "anything_else"), options }],
    events: [{ kind: "faq", text: `נענתה שאלה נפוצה: ${faq.question}` }],
  }
}

function fromFlow(turn: Awaited<ReturnType<typeof botTurn>>): EngineTurn {
  return {
    state: STEP_STATE[turn.state.step],
    mode: "bot",
    context: { flow: turn.state, options: turn.state.options, at: new Date().toISOString() },
    messages: turn.messages,
    events: turn.events,
    appointmentId: turn.appointmentId,
  }
}

async function runMenuItem(ctx: EngineContext, item: MenuItem, conv: Conversation): Promise<EngineTurn> {
  switch (item.action) {
    case "book": {
      if (!ctx.flow.services.length) return { ...welcome(ctx), messages: [{ text: "עוד לא אפשר לקבוע תור כאן, נחזור אליך בהקדם 🙏" }] }
      return fromFlow(startBooking(ctx.flow))
    }
    case "faqs": {
      const options = faqOptions(ctx)
      return { state: "FAQ", mode: "bot", context: { options, at: new Date().toISOString() }, messages: [{ text: say(ctx, "faq_prompt"), options }], events: [] }
    }
    case "faq": {
      const faq = ctx.faqs.find((f) => f.id === item.faq_id)
      return faq ? answerFaq(ctx, faq, { state: "WELCOME", context: {} }) : welcome(ctx)
    }
    case "handoff":
      return handoff(ctx, conv)
    case "reply": {
      const options = menuOptions(ctx)
      return { state: "WELCOME", mode: "bot", context: { options, at: new Date().toISOString() }, messages: [{ text: item.reply ?? "" }, { text: say(ctx, "anything_else"), options }], events: [] }
    }
  }
}

export function startConversation(ctx: EngineContext): EngineTurn {
  return welcome(ctx)
}

export async function engineTurn(conv: Conversation, input: { text?: string; optionId?: string }, ctx: EngineContext): Promise<EngineTurn> {
  // A human agent owns the conversation: the bot stays silent
  if (conv.mode === "manual_agent") return { ...conv, messages: [], events: [] }

  const text = input.text ?? ""
  if (!input.optionId && !text.trim()) return { ...conv, messages: [{ text: "כרגע אני מבין רק הודעות טקסט 🙂", options: conv.context.options }], events: [] }

  if (input.optionId === "menu" || (!input.optionId && hasKeyword(text, ctx.restartKeywords))) return welcome(ctx)
  if (!input.optionId && hasKeyword(text, ctx.handoffKeywords)) return handoff(ctx, conv)

  const stale = !conv.context.at || Date.now() - new Date(conv.context.at).getTime() > STALE_MS
  if (stale || conv.state === "CONFIRMED" && input.optionId !== "restart") {
    // A fresh message may already be a menu choice or a question
    const faq = !input.optionId && matchFaq(text, ctx.faqs)
    if (faq) return answerFaq(ctx, faq, { state: "WELCOME", context: {} })
    if (stale || !pick(conv.context.options, input)) return welcome(ctx)
  }

  switch (conv.state) {
    case "WELCOME": {
      const o = pick(conv.context.options ?? menuOptions(ctx), input)
      const item = o && ctx.menu.find((m) => `menu:${m.id}` === o.id)
      if (item) return runMenuItem(ctx, item, conv)
      const faq = matchFaq(text, ctx.faqs)
      if (faq) return answerFaq(ctx, faq, { state: "WELCOME", context: {} })
      const options = menuOptions(ctx)
      return { state: "WELCOME", mode: "bot", context: { options, at: new Date().toISOString() }, messages: [{ text: say(ctx, "fallback"), options }], events: [] }
    }
    case "FAQ": {
      const o = pick(conv.context.options ?? faqOptions(ctx), input)
      const faq = (o && ctx.faqs.find((f) => `faq:${f.id}` === o.id)) || matchFaq(text, ctx.faqs)
      if (faq) return answerFaq(ctx, faq, { state: "WELCOME", context: {} })
      const options = faqOptions(ctx)
      return { ...conv, context: { options, at: new Date().toISOString() }, messages: [{ text: say(ctx, "retry"), options }], events: [] }
    }
    case "CONFIRMED": {
      if (input.optionId === "restart" || pick(conv.context.options, input)?.id === "restart") return fromFlow(startBooking(ctx.flow))
      return welcome(ctx)
    }
    default: {
      const flow = conv.context.flow
      if (!flow) return welcome(ctx)
      // A question in the middle of booking gets answered, then the flow resumes
      const freeText = flow.step === "address" || flow.step === "email" || (flow.step === "question" && !flow.options.length)
      if (!input.optionId && !freeText && !pick(flow.options, input)) {
        const faq = matchFaq(text, ctx.faqs)
        if (faq) return answerFaq(ctx, faq, { state: conv.state, context: conv.context }, flow.options)
      }
      if (input.optionId === "restart") return fromFlow(startBooking(ctx.flow))
      return fromFlow(await botTurn(flow, input, ctx.flow))
    }
  }
}
