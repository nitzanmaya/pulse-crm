"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Heart, Sparkles, ListChecks, CalendarDays, User, Check, ArrowRight, ArrowLeft, Timer, Coins, MessageCircle, Mail,
  MapPin, Phone, Sun, Sunset, Moon, CalendarPlus, RotateCcw, Loader2, CircleAlert, ChevronLeft, ChevronRight,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  quote, localParts, fmtTime, fmtDay, todayKey, addDays, minutesLabel, serviceColor, googleCalendarLink, WEEKDAYS_SHORT, dowOf,
} from "@/lib/booking/shared";

const ils = (n) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
const STEPS = [
  { label: "שירות", icon: Sparkles },
  { label: "פרטי השירות", icon: ListChecks },
  { label: "מועד", icon: CalendarDays },
  { label: "פרטים אישיים", icon: User },
  { label: "אישור", icon: Check },
];
const WINDOW = 14;
const input = "w-full h-12 rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-800 placeholder:text-slate-400 shadow-sm transition focus:border-rose-300 focus:outline-none focus:ring-4 focus:ring-rose-100";

const CONFETTI = Array.from({ length: 18 }, (_, i) => {
  const a = (i / 18) * Math.PI * 2;
  return { dx: `${Math.round(Math.cos(a) * (90 + (i % 3) * 40))}px`, dy: `${Math.round(Math.sin(a) * (90 + (i % 3) * 40))}px`, r: `${(i % 2 ? 1 : -1) * (160 + i * 20)}deg`, c: ["bg-rose-500", "bg-amber-400", "bg-violet-500", "bg-sky-400", "bg-emerald-400", "bg-pink-400"][i % 6] };
});

function Stepper({ step }) {
  return (
    <div className="px-1">
      <div className="relative h-2 overflow-hidden rounded-full bg-rose-100">
        <div className="absolute inset-y-0 start-0 rounded-full bg-gradient-to-l from-rose-500 to-pink-500 transition-all duration-700 ease-out" style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} />
      </div>
      <ol className="mt-3 grid grid-cols-5 gap-1">
        {STEPS.map((s, i) => (
          <li key={s.label} className="flex flex-col items-center gap-1 text-center">
            <span className={`flex h-9 w-9 items-center justify-center rounded-full transition-all duration-500 ${i < step ? "bg-emerald-500 text-white" : i === step ? "scale-110 bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/30" : "bg-white text-slate-400 ring-1 ring-slate-200"}`}>
              {i < step ? <Check size={17} strokeWidth={3} /> : <s.icon size={17} />}
            </span>
            <span className={`hidden text-xs font-semibold sm:block ${i === step ? "text-rose-600" : "text-slate-400"}`}>{s.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function NextBtn({ children, disabled, onClick, busy }) {
  return (
    <button onClick={onClick} disabled={disabled || busy}
      className="group inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-l from-rose-500 to-pink-500 text-lg font-bold text-white shadow-xl shadow-rose-500/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-rose-500/35 active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45 sm:w-auto sm:min-w-56 sm:px-8">
      {busy ? <Loader2 size={20} className="animate-spin" /> : null}
      {children}
      {!busy && <ArrowLeft size={20} className="transition group-hover:-translate-x-1" />}
    </button>
  );
}

function QuoteBar({ service, answers }) {
  const q = quote(service, answers);
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200"><Timer size={15} className="text-violet-500" />{minutesLabel(q.minutes)}</span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200"><Coins size={15} className="text-emerald-500" />{ils(q.price)}</span>
    </div>
  );
}

export default function BookingFlow({ org, services }) {
  const [db] = useState(createClient);
  const [step, setStep] = useState(0);
  const [service, setService] = useState(null);
  const [answers, setAnswers] = useState({});
  const [from, setFrom] = useState(todayKey);
  const [slots, setSlots] = useState(null);
  const [day, setDay] = useState(null);
  const [slot, setSlot] = useState(null);
  const [form, setForm] = useState({ name: "", phone: "", address: "", email: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [reload, setReload] = useState(0);

  const needsAnswers = (service?.questions ?? []).filter((q) => q.required && !String(answers[q.id] ?? "").trim());
  const go = (n) => { setError(""); setStep(n); window.scrollTo({ top: 0, behavior: "smooth" }); };

  // Free slots for the chosen service (duration depends on the answers)
  useEffect(() => {
    if (step !== 2 || !service) return;
    let alive = true;
    db.rpc("get_booking_slots", { _slug: org.slug, _service: service.id, _answers: answers, _from: from, _days: WINDOW }).then(({ data, error: e }) => {
      if (!alive) return;
      if (e) { setError("לא הצלחנו לטעון שעות פנויות. נסו לרענן את הדף."); setSlots([]); return; }
      const list = data.map((s) => ({ start: s.slot_start, end: s.slot_end }));
      setSlots(list);
      setDay((d) => (d && list.some((s) => localParts(s.start).day === d) ? d : list[0] ? localParts(list[0].start).day : null));
    });
    return () => { alive = false; };
  }, [step, service, answers, from, org.slug, db, reload]);

  const days = useMemo(() => Array.from({ length: WINDOW }, (_, i) => addDays(from, i)), [from]);
  const byDay = useMemo(() => {
    const m = {};
    for (const s of slots ?? []) (m[localParts(s.start).day] ||= []).push(s);
    return m;
  }, [slots]);
  const daySlots = (day && byDay[day]) || [];
  const parts = [
    { label: "בוקר", icon: Sun, items: daySlots.filter((s) => localParts(s.start).hour < 12) },
    { label: "צהריים", icon: Sunset, items: daySlots.filter((s) => { const h = localParts(s.start).hour; return h >= 12 && h < 17; }) },
    { label: "ערב", icon: Moon, items: daySlots.filter((s) => localParts(s.start).hour >= 17) },
  ].filter((p) => p.items.length);
  const maxFrom = addDays(todayKey(), Math.max(0, org.max_days - WINDOW + 1));

  const phoneOk = form.phone.replace(/\D/g, "").length >= 9;
  const emailOk = !form.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const formOk = form.name.trim().length >= 2 && phoneOk && form.address.trim().length >= 4 && emailOk;

  const pickService = (s) => {
    setService(s);
    setAnswers(Object.fromEntries((s.questions ?? []).filter((q) => q.type === "number").map((q) => [q.id, String(q.min ?? 1)])));
    setSlots(null); setSlot(null); setDay(null);
    go(s.questions?.length ? 1 : 2);
  };

  const submit = async () => {
    setBusy(true); setError("");
    const res = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: org.slug, serviceId: service.id, startsAt: slot.start, answers, ...form }),
    }).catch(() => null);
    const body = await res?.json().catch(() => ({}));
    setBusy(false);
    if (res?.ok) { setResult(body); go(4); return; }
    if (body?.error === "slot_taken") {
      setSlot(null); setReload((n) => n + 1); go(2);
      setError("אופס, מישהו הזמין את השעה הזו ממש עכשיו. בחרו בבקשה שעה אחרת.");
      return;
    }
    setError(body?.error === "invalid" ? "חלק מהפרטים לא תקינים, בדקו את הטלפון והמייל." : "משהו השתבש בשליחה. נסו שוב בעוד רגע.");
  };

  const reset = () => { setService(null); setAnswers({}); setSlot(null); setSlots(null); setResult(null); setForm({ name: "", phone: "", address: "", email: "", notes: "" }); go(0); };
  const c = serviceColor(service?.color);

  return (
    <main dir="rtl" className="relative min-h-screen overflow-hidden bg-[#fdf8fa] px-4 pb-16 pt-8 sm:pt-12">
      <div aria-hidden className="pointer-events-none absolute -end-32 -top-32 h-96 w-96 rounded-full bg-rose-300/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -start-32 h-[28rem] w-[28rem] rounded-full bg-violet-300/25 blur-3xl" />

      <div className="relative mx-auto w-full max-w-2xl">
        <header className="mb-7 flex animate-fade-up flex-col items-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-rose-500 to-pink-500 text-2xl font-bold text-white shadow-xl shadow-rose-500/30">{org.name[0]}</span>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{org.name}</h1>
          <p className="mt-1.5 max-w-md text-base text-slate-500">{org.headline || "קביעת תור אונליין, בכמה קליקים"}</p>
        </header>

        {step < 4 && <div className="mb-6 animate-fade-up" style={{ animationDelay: "60ms" }}><Stepper step={step} /></div>}

        <section key={step} className="animate-pop-in rounded-[2rem] border border-slate-200/80 bg-white/90 p-5 shadow-2xl shadow-slate-900/10 backdrop-blur sm:p-8">
          {error && (
            <div role="alert" className="mb-5 flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-[15px] font-medium text-red-700"><CircleAlert size={19} className="mt-0.5 shrink-0" />{error}</div>
          )}

          {step === 0 && (
            <>
              <h2 className="text-2xl font-bold text-slate-900">איזה שירות תרצו להזמין?</h2>
              <p className="mt-1 text-base text-slate-500">בחרו שירות, ובשלב הבא נשאל כמה שאלות קצרות.</p>
              {services.length === 0 && <p className="mt-6 rounded-2xl bg-amber-50 px-4 py-3 text-amber-700">אין כרגע שירותים פתוחים להזמנה. נסו שוב מאוחר יותר.</p>}
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {services.map((s, i) => {
                  const sc = serviceColor(s.color);
                  return (
                    <button key={s.id} onClick={() => pickService(s)} style={{ animationDelay: `${i * 70}ms` }}
                      className="group relative animate-fade-up overflow-hidden rounded-3xl border-2 border-slate-100 bg-white p-5 text-start shadow-sm transition duration-300 hover:-translate-y-1 hover:border-rose-200 hover:shadow-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-200 active:scale-[0.98]">
                      <div aria-hidden className={`absolute -end-10 -top-10 h-28 w-28 rounded-full bg-gradient-to-br ${sc.grad} opacity-10 transition duration-500 group-hover:scale-150 group-hover:opacity-20`} />
                      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br ${sc.grad} text-white shadow-md transition duration-300 group-hover:-rotate-6 group-hover:scale-110`}><Sparkles size={22} /></span>
                      <span className="mt-3 block text-lg font-bold text-slate-900">{s.name}</span>
                      {s.description && <span className="mt-0.5 block text-sm leading-relaxed text-slate-500">{s.description}</span>}
                      <span className="mt-3 flex items-center gap-3 text-sm font-semibold text-slate-600">
                        <span className="flex items-center gap-1"><Timer size={15} />{minutesLabel(s.duration_minutes)}</span>
                        <span className="flex items-center gap-1 text-emerald-600"><Coins size={15} />{s.questions?.some((q) => q.extra_price) ? "החל מ-" : ""}{ils(s.price)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === 1 && service && (
            <>
              <h2 className="text-2xl font-bold text-slate-900">עוד כמה פרטים על {service.name}</h2>
              <p className="mt-1 text-base text-slate-500">כך נדע כמה זמן לשריין ומה המחיר.</p>
              <div className="mt-6 flex flex-col gap-6">
                {service.questions.map((q) => (
                  <div key={q.id}>
                    <div className="mb-2.5 text-[17px] font-semibold text-slate-800">{q.label}{q.required && <span className="text-rose-500"> *</span>}</div>
                    {q.type === "number" && (() => {
                      const n = Number(answers[q.id]) || q.min || 1;
                      const set = (v) => setAnswers({ ...answers, [q.id]: String(Math.max(q.min ?? 1, Math.min(q.max ?? 50, v))) });
                      return (
                        <div className="flex items-center gap-4">
                          <button type="button" onClick={() => set(n - 1)} disabled={n <= (q.min ?? 1)} aria-label="פחות" className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-2xl font-bold text-slate-600 transition hover:border-rose-300 hover:text-rose-600 active:scale-90 disabled:opacity-40">−</button>
                          <span key={n} className="w-14 animate-pop-in text-center text-4xl font-bold tabular-nums text-slate-900">{n}</span>
                          <button type="button" onClick={() => set(n + 1)} disabled={n >= (q.max ?? 50)} aria-label="יותר" className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-2xl font-bold text-slate-600 transition hover:border-rose-300 hover:text-rose-600 active:scale-90 disabled:opacity-40">+</button>
                          {q.extra_price > 0 && <span className="text-sm text-slate-500">+{ils(q.extra_price)} לכל יחידה נוספת</span>}
                        </div>
                      );
                    })()}
                    {q.type === "select" && (
                      <div className="flex flex-wrap gap-2.5">
                        {(q.options ?? []).map((o) => (
                          <button key={o} type="button" onClick={() => setAnswers({ ...answers, [q.id]: o })} aria-pressed={answers[q.id] === o}
                            className={`h-12 rounded-2xl border-2 px-5 text-base font-semibold transition duration-200 active:scale-95 ${answers[q.id] === o ? "border-rose-400 bg-rose-50 text-rose-700 shadow-md shadow-rose-500/10" : "border-slate-200 bg-white text-slate-600 hover:border-rose-200"}`}>
                            {answers[q.id] === o && <Check size={16} className="me-1.5 inline" strokeWidth={3} />}{o}
                          </button>
                        ))}
                      </div>
                    )}
                    {q.type === "text" && <input className={input} value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />}
                  </div>
                ))}
              </div>
              <div className={`mt-7 rounded-2xl ${c.soft} p-4`}>
                <div className="mb-2 text-sm font-semibold text-slate-600">הערכה לפי התשובות</div>
                <QuoteBar service={service} answers={answers} />
              </div>
              <div className="mt-7 flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
                <button onClick={() => go(0)} className="inline-flex items-center gap-1.5 text-base font-semibold text-slate-500 transition hover:text-rose-600"><ArrowRight size={18} />חזרה</button>
                <NextBtn disabled={needsAnswers.length > 0} onClick={() => go(2)}>לבחירת מועד</NextBtn>
              </div>
            </>
          )}

          {step === 2 && service && (
            <>
              <h2 className="text-2xl font-bold text-slate-900">מתי נוח לכם?</h2>
              <div className="mt-2"><QuoteBar service={service} answers={answers} /></div>

              <div className="mt-6 flex items-center gap-2">
                <button onClick={() => setFrom(addDays(from, -WINDOW))} disabled={from <= todayKey()} aria-label="ימים קודמים" className="shrink-0 rounded-full p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"><ChevronRight size={22} /></button>
                <div className="-my-2 flex flex-1 snap-x gap-2 overflow-x-auto py-2">
                  {days.map((d) => {
                    const n = byDay[d]?.length ?? 0;
                    const active = d === day;
                    return (
                      <button key={d} onClick={() => { setDay(d); setSlot(null); }} disabled={!slots || !n} aria-pressed={active}
                        className={`flex w-16 shrink-0 snap-start flex-col items-center rounded-2xl border-2 py-2.5 transition duration-200 active:scale-95 disabled:border-transparent disabled:bg-slate-50 disabled:text-slate-300 ${active ? "border-rose-400 bg-gradient-to-b from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/30" : "border-slate-100 bg-white text-slate-700 hover:border-rose-200"}`}>
                        <span className={`text-xs font-semibold ${active ? "text-white/90" : ""}`}>{d === todayKey() ? "היום" : WEEKDAYS_SHORT[dowOf(d)]}</span>
                        <span className="text-xl font-bold tabular-nums">{Number(d.slice(8))}</span>
                        <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${n ? (active ? "bg-white" : "bg-emerald-400") : "bg-transparent"}`} />
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => setFrom(addDays(from, WINDOW))} disabled={from >= maxFrom} aria-label="ימים הבאים" className="shrink-0 rounded-full p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"><ChevronLeft size={22} /></button>
              </div>

              <div className="mt-6 min-h-40">
                {!slots && <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{Array.from({ length: 8 }, (_, i) => <div key={i} className="h-12 animate-pulse rounded-2xl bg-slate-100" />)}</div>}
                {slots && !slots.length && (
                  <div className="flex flex-col items-center gap-2 rounded-2xl bg-slate-50 p-8 text-center">
                    <CalendarDays size={30} className="text-slate-300" />
                    <p className="text-base font-semibold text-slate-600">אין שעות פנויות בטווח הזה</p>
                    {from < maxFrom && <button onClick={() => setFrom(addDays(from, WINDOW))} className="text-[15px] font-semibold text-rose-600 hover:underline">לבדוק את השבועיים הבאים</button>}
                  </div>
                )}
                {day && parts.map((p) => (
                  <div key={p.label} className="mb-4">
                    <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-500"><p.icon size={16} />{p.label}</div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {p.items.map((s, i) => (
                        <button key={s.start} onClick={() => setSlot(s)} aria-pressed={slot?.start === s.start} style={{ animationDelay: `${i * 25}ms` }}
                          className={`h-12 animate-pop-in rounded-2xl border-2 text-base font-bold tabular-nums transition duration-200 active:scale-95 ${slot?.start === s.start ? "border-rose-400 bg-gradient-to-l from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/30" : "border-slate-100 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md"}`}>
                          {fmtTime(s.start)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
                <button onClick={() => go(service.questions?.length ? 1 : 0)} className="inline-flex items-center gap-1.5 text-base font-semibold text-slate-500 transition hover:text-rose-600"><ArrowRight size={18} />חזרה</button>
                <NextBtn disabled={!slot} onClick={() => go(3)}>{slot ? `${fmtDay(localParts(slot.start).day, { weekday: "short", day: "numeric", month: "numeric" })} · ${fmtTime(slot.start)}` : "בחרו שעה"}</NextBtn>
              </div>
            </>
          )}

          {step === 3 && service && slot && (
            <>
              <h2 className="text-2xl font-bold text-slate-900">כמעט סיימנו! למי מגיעים?</h2>
              <div className={`mt-4 flex items-center gap-3 rounded-2xl ${c.soft} p-4`}>
                <span className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br ${c.grad} text-white shadow-md`}>
                  <span className="text-[11px] font-semibold leading-none">{WEEKDAYS_SHORT[localParts(slot.start).dow]}</span>
                  <span className="text-lg font-bold leading-tight">{Number(localParts(slot.start).day.slice(8))}</span>
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-bold text-slate-900">{service.name}</div>
                  <div className="text-sm text-slate-600">{fmtDay(localParts(slot.start).day)} · <bdi dir="ltr">{fmtTime(slot.start)}–{fmtTime(slot.end)}</bdi></div>
                </div>
                <button onClick={() => go(2)} className="text-sm font-semibold text-rose-600 hover:underline">שינוי</button>
              </div>
              <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5"><span className="text-[15px] font-semibold text-slate-700">שם מלא *</span>
                  <input className={input} autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ישראל ישראלי" /></label>
                <label className="flex flex-col gap-1.5"><span className="text-[15px] font-semibold text-slate-700">טלפון נייד *</span>
                  <input className={`${input} text-right`} dir="ltr" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="050-1234567" /></label>
                <label className="flex flex-col gap-1.5 sm:col-span-2"><span className="text-[15px] font-semibold text-slate-700">כתובת לביקור *</span>
                  <input className={input} autoComplete="street-address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="רחוב, מספר בית, עיר" /></label>
                <label className="flex flex-col gap-1.5"><span className="text-[15px] font-semibold text-slate-700">אימייל <span className="font-normal text-slate-400">(לאישור במייל)</span></span>
                  <input className={`${input} text-right ${emailOk ? "" : "border-red-300"}`} dir="ltr" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="name@mail.com" /></label>
                <label className="flex flex-col gap-1.5"><span className="text-[15px] font-semibold text-slate-700">הערות <span className="font-normal text-slate-400">(לא חובה)</span></span>
                  <input className={input} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="קומה, קוד לבניין..." /></label>
              </div>
              <p className="mt-4 text-sm text-slate-400">הפרטים משמשים רק לתיאום התור ולשליחת אישור ותזכורת.</p>
              <div className="mt-6 flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
                <button onClick={() => go(2)} className="inline-flex items-center gap-1.5 text-base font-semibold text-slate-500 transition hover:text-rose-600"><ArrowRight size={18} />חזרה</button>
                <NextBtn disabled={!formOk} busy={busy} onClick={submit}>אישור וקביעת התור</NextBtn>
              </div>
            </>
          )}

          {step === 4 && result && (
            <div className="flex flex-col items-center text-center">
              <div className="relative mt-2">
                <span className="flex h-24 w-24 animate-pop-in items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-2xl shadow-emerald-500/30">
                  <Check size={48} strokeWidth={3} />
                </span>
                <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30 [animation-iteration-count:2]" />
                <div aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
                  {CONFETTI.map((k, i) => <span key={i} className={`absolute h-2.5 w-2.5 animate-confetti rounded-sm ${k.c}`} style={{ "--dx": k.dx, "--dy": k.dy, "--r": k.r }} />)}
                </div>
              </div>
              <h2 className="mt-6 text-3xl font-bold text-slate-900">התור נקבע! 🎉</h2>
              <p className="mt-1 text-lg text-slate-500">תודה {form.name.split(" ")[0]}, מחכים לראות אותך.</p>

              <div className="mt-6 w-full overflow-hidden rounded-3xl border border-slate-100 bg-gradient-to-l from-rose-50 to-violet-50 text-start">
                <div className="flex items-center gap-4 p-5">
                  <span className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br ${c.grad} text-white shadow-md`}>
                    <span className="text-xs font-semibold leading-none">{WEEKDAYS_SHORT[localParts(result.starts_at).dow]}</span>
                    <span className="text-xl font-bold leading-tight">{Number(localParts(result.starts_at).day.slice(8))}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-bold text-slate-900">{result.service}</div>
                    <div className="text-[15px] text-slate-600">{fmtDay(localParts(result.starts_at).day)} · <bdi dir="ltr">{fmtTime(result.starts_at)}–{fmtTime(result.ends_at)}</bdi></div>
                    <div className="mt-0.5 flex items-center gap-1 text-sm text-slate-500"><MapPin size={14} />{form.address}</div>
                  </div>
                  <div className="text-lg font-bold tabular-nums text-slate-900">{ils(result.price)}</div>
                </div>
              </div>

              <ul className="mt-5 flex w-full flex-col gap-2.5 text-start">
                {result.sent?.whatsapp && (
                  <li className="flex animate-fade-up items-center gap-3 rounded-2xl bg-[#e7fbe9] px-4 py-3" style={{ animationDelay: "200ms" }}>
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25d366] text-white"><MessageCircle size={20} /></span>
                    <span className="flex-1 text-[15px] text-slate-700">אישור נשלח אליך ב-WhatsApp ל-<span dir="ltr" className="font-semibold">{form.phone}</span></span>
                    <Check size={20} className="text-emerald-600" strokeWidth={3} />
                  </li>
                )}
                {result.sent?.email && (
                  <li className="flex animate-fade-up items-center gap-3 rounded-2xl bg-sky-50 px-4 py-3" style={{ animationDelay: "320ms" }}>
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-500 text-white"><Mail size={19} /></span>
                    <span className="flex-1 text-[15px] text-slate-700">אישור נשלח במייל ל-<span dir="ltr" className="font-semibold">{form.email}</span></span>
                    <Check size={20} className="text-sky-600" strokeWidth={3} />
                  </li>
                )}
                {!result.sent?.whatsapp && !result.sent?.email && (
                  <li className="flex items-center gap-3 rounded-2xl bg-slate-50 px-4 py-3 text-[15px] text-slate-600">
                    <Phone size={18} className="shrink-0 text-slate-400" />{org.name} קיבלו את ההזמנה, ואישור יישלח אליך בהקדם.
                  </li>
                )}
              </ul>

              <div className="mt-7 flex w-full flex-col gap-2.5 sm:flex-row">
                <a href={googleCalendarLink(`${result.service} · ${org.name}`, result.starts_at, result.ends_at, form.address)} target="_blank" rel="noreferrer"
                  className="inline-flex h-13 flex-1 items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white py-3 text-base font-bold text-slate-700 transition hover:-translate-y-0.5 hover:border-rose-200 hover:text-rose-600 hover:shadow-md">
                  <CalendarPlus size={19} />הוספה ליומן Google
                </a>
                <button onClick={reset} className="inline-flex h-13 flex-1 items-center justify-center gap-2 rounded-2xl py-3 text-base font-semibold text-slate-500 transition hover:text-rose-600">
                  <RotateCcw size={18} />קביעת תור נוסף
                </button>
              </div>
            </div>
          )}
        </section>

        <p className="mt-8 flex items-center justify-center gap-1.5 text-sm text-slate-400">
          מופעל על ידי Pulse CRM <Heart size={13} className="animate-heartbeat fill-rose-400 text-rose-400" />
        </p>
      </div>
    </main>
  );
}
