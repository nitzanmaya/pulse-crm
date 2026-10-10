"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CheckCheck, MoreVertical, Paperclip, RotateCcw, Send, Smile, Phone, Video, Bot, CalendarCheck, Search, Sparkles, BellRing, FlaskConical, HelpCircle, Headset } from "lucide-react";
import { BOT_STEPS } from "@/lib/bot/flow";
import { startConversation, engineTurn } from "@/lib/bot/engine";
import { botTexts } from "@/lib/bot/texts";
import { EXAMPLE_SERVICES, addDays, dowOf, todayKey, zonedToUtc, quote } from "@/lib/booking/shared";

// Demo slots when the org has no real services / the booking page is off:
// hourly within opening hours (Sun-Thu 09-17 by default), a few taken.
function demoSlots(rules, minutes) {
  const out = [];
  const base = todayKey();
  for (let i = 1; i <= 14; i++) {
    const day = addDays(base, i);
    const ranges = rules.length ? rules.filter((r) => r.weekday === dowOf(day)).map((r) => [r.start_time.slice(0, 5), r.end_time.slice(0, 5)]) : dowOf(day) < 5 ? [["09:00", "17:00"]] : [];
    for (const [a, b] of ranges) {
      const [ah] = a.split(":").map(Number);
      const [bh] = b.split(":").map(Number);
      for (let h = ah; h * 60 + minutes <= bh * 60; h++) {
        if ((i * 7 + h * 3) % 5 === 0) continue;
        const start = zonedToUtc(day, `${String(h).padStart(2, "0")}:00`);
        out.push({ start: start.toISOString(), end: new Date(start.getTime() + minutes * 60000).toISOString() });
      }
    }
  }
  return out;
}

const nowLabel = () => new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());

function Bubble({ m, last, onPick }) {
  const mine = m.from === "me";
  return (
    <div className={`flex animate-pop-in ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[86%]">
        {(m.text || m.card) && (
          <div className={`relative rounded-xl px-2.5 pb-1.5 pt-1.5 text-[14.5px] leading-snug text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] ${mine ? "rounded-se-none bg-[#d9fdd3]" : "rounded-ss-none bg-white"}`}>
            {m.card && (
              <div className={`mb-1 overflow-hidden rounded-lg ${m.card.title.startsWith("✅") ? "bg-gradient-to-l from-emerald-50 to-teal-50 ring-1 ring-emerald-200" : "bg-[#f5f6f6]"}`}>
                {m.card.title.startsWith("✅") && (
                  <div className="flex items-center gap-2 bg-gradient-to-l from-emerald-500 to-teal-500 px-3 py-2 text-white">
                    <CalendarCheck size={18} /><span className="text-sm font-bold">{m.card.title.replace("✅ ", "")}</span>
                  </div>
                )}
                <div className="px-3 py-2">
                  {!m.card.title.startsWith("✅") && <div className="mb-1 text-[15px] font-bold">{m.card.title}</div>}
                  {m.card.lines.map((l, i) => <div key={i} className="text-[13.5px] text-[#3b4a54]">{l}</div>)}
                </div>
              </div>
            )}
            {m.text && <span className="whitespace-pre-line">{m.text}</span>}
            <span className="float-end ms-3 mt-1.5 flex items-center gap-0.5 text-[11px] text-[#667781]">
              {m.time}{mine && <CheckCheck size={15} className="text-[#53bdeb]" />}
            </span>
          </div>
        )}
        {m.options?.length > 0 && (
          <div className="mt-1 grid gap-1">
            {m.options.map((o) => (
              <button key={o.id} disabled={!last} onClick={() => onPick(o)}
                className="rounded-xl bg-white px-3 py-2 text-center text-[14px] font-medium text-[#027eb5] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] transition hover:bg-[#f5f6f6] active:scale-[0.98] disabled:cursor-default disabled:text-[#8696a0] disabled:hover:bg-white">
                {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// Which progress step a conversation state belongs to
const STEP_OF = { WELCOME: "greeting", FAQ: "greeting", SERVICE_SELECT: "service", SERVICE_QUESTIONS: "service", DATE_SELECT: "time", TIME_SELECT: "time", ADDRESS: "address", CONFIRM: "confirm", CONFIRMED: "confirm" };
const QUESTION_STEP = { SERVICE_QUESTIONS: "question" };

// bot: the content to simulate (defaults to the saved content; the editor passes its draft)
export default function WhatsAppSimulator({ org, db, bot = org.bot }) {
  const services = useMemo(() => {
    const real = org.services.filter((s) => s.is_active).map((s) => ({ ...s, price: Number(s.price) }));
    return real.length ? real : EXAMPLE_SERVICES.map((s, i) => ({ ...s, id: `demo-${i}` }));
  }, [org.services]);
  const demo = services[0]?.id.startsWith("demo-");

  const ctx = useMemo(() => ({
    texts: botTexts(bot.scripts),
    menu: bot.menu.filter((m) => m.is_active),
    faqs: bot.faqs.filter((f) => f.is_active),
    handoffKeywords: bot.settings?.handoff_keywords ?? [],
    restartKeywords: bot.settings?.restart_keywords ?? [],
    flow: {
      orgName: org.name,
      customerName: "דנה",
      texts: botTexts(bot.scripts),
      services,
      getSlots: async (service, answers) => {
        if (!service.id.startsWith("demo-") && org.booking.enabled) {
          const { data, error } = await db.rpc("get_booking_slots", { _slug: org.slug, _service: service.id, _answers: answers, _days: 14 });
          if (!error) return data.map((s) => ({ start: s.slot_start, end: s.slot_end }));
        }
        return demoSlots(org.rules, quote(service, answers).minutes);
      },
    },
  }), [org.name, org.slug, org.booking.enabled, org.rules, services, db, bot]);

  const [msgs, setMsgs] = useState([]);
  const [state, setState] = useState(null);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [log, setLog] = useState([]);
  const scroller = useRef(null);
  const timers = useRef([]);

  const play = (turn) => {
    setState({ state: turn.state, mode: turn.mode, context: turn.context });
    if (turn.events.length) setLog((l) => [...turn.events.map((e) => ({ ...e, at: nowLabel() })), ...l].slice(0, 8));
    turn.messages.forEach((m, i) => {
      timers.current.push(setTimeout(() => setTyping(true), i * 900));
      timers.current.push(setTimeout(() => {
        setTyping(i < turn.messages.length - 1);
        setMsgs((all) => [...all, { ...m, from: "bot", time: nowLabel(), id: `${Date.now()}-${i}` }]);
      }, i * 900 + 650));
    });
  };

  const restart = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setMsgs([]);
    setLog([]);
    play(startConversation(ctx));
  };

  useEffect(() => {
    const t = setTimeout(() => play(startConversation(ctx)), 300);
    const all = timers.current;
    return () => { clearTimeout(t); all.forEach(clearTimeout); };
  }, [ctx]);

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [msgs, typing]);

  const send = async (input, label) => {
    if (!state || typing) return;
    setMsgs((all) => [...all, { from: "me", text: label, time: nowLabel(), id: `me-${Date.now()}` }]);
    setTyping(true);
    const turn = await engineTurn(state, input, ctx);
    if (!turn.messages.length) setTyping(false);
    play(turn);
  };
  const submit = (e) => { e.preventDefault(); const t = text.trim(); if (!t) return; setText(""); send({ text: t }, t); };

  const stepId = state ? QUESTION_STEP[state.state] ?? STEP_OF[state.state] : "greeting";
  const activeStep = BOT_STEPS.findIndex((s) => s.id === stepId);
  const done = state?.state === "CONFIRMED";
  const manual = state?.mode === "manual_agent";
  const lastBot = msgs.map((m) => m.from).lastIndexOf("bot");

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[360px_1fr]">
      {/* phone */}
      <div className="mx-auto w-full max-w-[360px] rounded-[2.6rem] bg-slate-900 p-2.5 shadow-2xl shadow-slate-900/30 ring-1 ring-slate-700">
        <div className="relative flex h-[640px] flex-col overflow-hidden rounded-[2.1rem] bg-[#efeae2]">
          <div aria-hidden className="absolute left-1/2 top-2 z-20 h-5 w-24 -translate-x-1/2 rounded-full bg-slate-900" />
          <div className="relative z-10 flex items-center gap-2.5 bg-[#008069] px-3 pb-2.5 pt-9 text-white">
            <ArrowRight size={20} />
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-pink-500 text-sm font-bold">{org.name[0]}</span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-[15px] font-semibold">{org.name}</div>
              <div className="text-xs text-white/80">{typing ? "מקליד/ה…" : "חשבון עסקי · בוט אוטומטי"}</div>
            </div>
            <Video size={19} /><Phone size={17} /><MoreVertical size={19} />
          </div>

          <div ref={scroller} className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-3 py-3 [background-image:radial-gradient(rgba(0,0,0,0.035)_1px,transparent_1px)] [background-size:14px_14px]">
            <div className="mx-auto mb-1 rounded-lg bg-[#ffeecd] px-3 py-1.5 text-center text-[11.5px] leading-snug text-[#54656f] shadow-sm">
              🔒 ההודעות בשיחה מוצפנות מקצה לקצה. זהו סימולטור: לא נשלחות הודעות ולא נוצרים תורים.
            </div>
            {msgs.map((m, i) => <Bubble key={m.id} m={m} last={i === lastBot && !typing} onPick={(o) => send({ optionId: o.id }, o.label)} />)}
            {typing && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1 rounded-xl rounded-ss-none bg-white px-3.5 py-3 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]">
                  {[0, 150, 300].map((d) => <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-[#8696a0]" style={{ animationDelay: `${d}ms` }} />)}
                </div>
              </div>
            )}
          </div>

          <form onSubmit={submit} className="flex items-center gap-1.5 bg-transparent px-2 pb-3 pt-1">
            <div className="flex h-11 flex-1 items-center gap-2 rounded-full bg-white px-3 text-[#8696a0] shadow-sm">
              <Smile size={20} />
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="הודעה" aria-label="הודעה לבוט"
                className="min-w-0 flex-1 bg-transparent text-[15px] text-[#111b21] placeholder:text-[#8696a0] focus:outline-none" />
              <Paperclip size={19} />
            </div>
            <button type="submit" aria-label="שליחה" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-md transition active:scale-90">
              <Send size={19} className="-scale-x-100" />
            </button>
          </form>
        </div>
      </div>

      {/* flow + backstage */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-50 px-3 py-1 text-sm font-semibold text-violet-700"><FlaskConical size={15} />מצב סימולציה</span>
          {demo && <span className="rounded-full bg-amber-50 px-3 py-1 text-sm font-medium text-amber-700">משתמש בשירותי דוגמה כי עוד לא הוגדרו שירותים</span>}
          {!demo && org.booking.enabled && <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">שעות פנויות אמיתיות מהיומן</span>}
          {manual && <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-sm font-semibold text-amber-700"><Headset size={15} />הועבר לנציג, הבוט מושתק</span>}
          <button onClick={restart} className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200 transition hover:text-rose-600 active:scale-95"><RotateCcw size={15} />שיחה חדשה</button>
        </div>

        <ol className="flex flex-col gap-2">
          {BOT_STEPS.map((s, i) => {
            const isDone = i < activeStep || done;
            const active = i === activeStep && !done;
            return (
              <li key={s.id} className="flex items-center gap-3">
                <span className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold transition-all duration-500 ${isDone ? "bg-gradient-to-br from-emerald-400 to-teal-500 text-white" : active ? "scale-110 bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/30" : "bg-slate-100 text-slate-400"}`}>
                  {isDone ? "✓" : i + 1}
                  {active && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-rose-400/40" />}
                </span>
                <span className={`text-[15px] font-semibold transition ${active ? "text-rose-600" : isDone ? "text-slate-700" : "text-slate-400"}`}>{s.label}</span>
              </li>
            );
          })}
        </ol>

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Bot size={16} className="text-rose-500" />מה המערכת עושה ברקע</div>
          {log.length === 0 && <p className="mt-2 text-sm text-slate-400">בחרו שירות בשיחה, והפעולות שהבוט מבצע יופיעו כאן.</p>}
          <ul className="mt-2 flex flex-col gap-1.5">
            {log.map((e, i) => {
              const Icon = { slots: Search, booked: CalendarCheck, simulated: Sparkles, reminder: BellRing, faq: HelpCircle, handoff: Headset }[e.kind] ?? Sparkles;
              return (
                <li key={`${e.at}-${i}`} className="flex animate-pop-in items-start gap-2 text-sm text-slate-600">
                  <Icon size={15} className="mt-0.5 shrink-0 text-violet-500" />
                  <span className="flex-1">{e.text}</span>
                  <span className="text-xs tabular-nums text-slate-400">{e.at}</span>
                </li>
              );
            })}
          </ul>
        </div>
        <p className="text-sm leading-relaxed text-slate-500">
          הבוט משתמש בתפריט, בשאלות הנפוצות ובנוסחים מ״תוכן הבוט״, ובאותם שירותים ושעות פנויות של דף ההזמנה. אפשר ללחוץ על הכפתורים או להקליד חופשי (למשל ״3״, ״כמה זה עולה?״, ״נציג״ או ״תפריט״).
        </p>
      </div>
    </div>
  );
}
