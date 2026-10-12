"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Heart, Sparkles, ListChecks, CalendarDays, User, Check, ArrowRight, ArrowLeft, Timer, Coins, MessageCircle, Mail,
  MapPin, Phone, Sun, Sunset, Moon, CalendarPlus, RotateCcw, Loader2, CircleAlert, ChevronLeft, ChevronRight, Plus, Minus, ShoppingBag, Volume2, VolumeX,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  quote, localParts, fmtTime, fmtDay, slotLabel, todayKey, addDays, minutesLabel, serviceColor, googleCalendarLink, WEEKDAYS_SHORT, dowOf,
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

// Same wording as private.cart_quote: "2× מזגן קטן + ספה"
const cartTitle = (lines) => lines.map((l) => `${l.qty > 1 ? `${l.qty}× ` : ""}${l.service.name}`).join(" + ");

// The customer's own WhatsApp opens a chat with the business (0501234567 -> 972501234567)
const waNumber = (n) => { const d = String(n).replace(/\D/g, ""); return d.startsWith("0") ? `972${d.slice(1)}` : d; };

// Floating WhatsApp button (phones) with a light sweeping across it every few seconds
function WhatsAppFab({ org }) {
  if (!org.whatsapp) return null;
  return (
    <a href={`https://wa.me/${waNumber(org.whatsapp)}?text=${encodeURIComponent(`היי ${org.name}, הגעתי מדף ההזמנה`)}`} target="_blank" rel="noreferrer"
      aria-label={`שליחת הודעת WhatsApp ל${org.name}`}
      className="fixed bottom-[calc(env(safe-area-inset-bottom)+20px)] left-5 z-40 flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-[#25D366] text-white shadow-xl shadow-green-600/40 ring-4 ring-white transition hover:scale-105 active:scale-90 sm:hidden">
      <span aria-hidden className="animate-sweep pointer-events-none absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-l from-transparent via-white/50 to-transparent" />
      <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" aria-hidden><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2Zm5.8 14.03c-.25.69-1.44 1.32-1.98 1.37-.51.05-.99.24-3.33-.69-2.82-1.11-4.6-4-4.74-4.18-.14-.19-1.13-1.5-1.13-2.86s.71-2.03.97-2.31c.25-.28.55-.35.73-.35l.53.01c.17.01.4-.06.62.47.25.6.85 2.06.92 2.21.08.15.12.32.03.51-.1.19-.14.31-.28.48l-.42.49c-.14.14-.28.29-.12.57.16.28.72 1.19 1.55 1.93 1.07.95 1.97 1.25 2.25 1.39.28.14.44.12.6-.07.17-.19.7-.82.88-1.1.19-.28.37-.23.62-.14.25.09 1.6.76 1.88.89.28.14.46.21.53.32.07.12.07.67-.18 1.36Z"/></svg>
    </a>
  );
}

// "ניקוי מזגנים" + "ניקוי ספות" -> "ניקוי מזגנים + ספות"
// Short "added to cart" chime made on the fly, no audio file needed
let audioCtx;
function chime(up) {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    const t = audioCtx.currentTime;
    (up ? [660, 990] : [520, 390]).forEach((f, i) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(up ? 0.22 : 0.12, t + i * 0.09 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.22);
      o.connect(g).connect(audioCtx.destination);
      o.start(t + i * 0.09); o.stop(t + i * 0.09 + 0.25);
    });
  } catch {}
}

// A small "+1" bubble that arcs from the tapped button into the cart
function flyToCart(fromEl, toEl, grad) {
  if (!fromEl || !toEl || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
  const dot = document.createElement("div");
  dot.textContent = "+1";
  dot.className = `pointer-events-none fixed z-50 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br ${grad} text-sm font-bold text-white shadow-xl ring-2 ring-white`;
  dot.style.left = `${a.left + a.width / 2 - 22}px`;
  dot.style.top = `${a.top + a.height / 2 - 22}px`;
  document.body.appendChild(dot);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  dot.animate([
    { transform: "translate(0,0) scale(1)", opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 120}px) scale(1.15)`, opacity: 1, offset: 0.45 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0.6 },
  ], { duration: 650, easing: "cubic-bezier(0.45, 0, 0.55, 1)" }).onfinish = () => dot.remove();
}

function comboLabel(groups) {
  const first = groups.map((g) => g.split(" ")[0]);
  if (groups.every((g) => g.includes(" ")) && first.every((w) => w === first[0])) {
    return `${groups[0]} + ${groups.slice(1).map((g) => g.slice(first[0].length + 1)).join(" + ")}`;
  }
  return groups.join(" + ");
}

export default function BookingFlow({ org, services }) {
  const [db] = useState(createClient);
  // Service groups: with two or more, the customer picks a group (or all) first
  const groups = useMemo(() => [...new Set(services.map((s) => s.category?.trim()).filter(Boolean))], [services]);
  const grouped = groups.length >= 2;
  const [group, setGroup] = useState(null); // null = not chosen yet, "*" = all
  const shown = grouped && group && group !== "*" ? services.filter((s) => !s.category?.trim() || s.category.trim() === group) : services;
  const otherGroups = grouped && group && group !== "*" ? groups.filter((g) => g !== group) : [];
  const [hintOff, setHintOff] = useState(false);
  // Cart mode: once a group is picked, the customer builds one visit from any
  // number of services, like an online store; the cart survives switching groups
  const cartMode = grouped && group !== null;
  const cartShown = group === "*" ? [...groups, null] : [group, null];
  const [cart, setCart] = useState({});
  const bagRef = useRef(null);
  const [bump, setBump] = useState(0);
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem("booking-muted") === "1"; } catch { return false; } });
  const toggleMute = () => { setMuted((m) => { try { localStorage.setItem("booking-muted", m ? "0" : "1"); } catch {} return !m; }); };
  const addOne = (s, e, n) => {
    if (n >= 20) return;
    setQty(s.id, n + 1);
    flyToCart(e.currentTarget, bagRef.current, serviceColor(s.color).grad);
    if (!muted) chime(true);
    navigator.vibrate?.(12);
    setTimeout(() => setBump((b) => b + 1), 600);
  };
  const removeOne = (s, n) => { setQty(s.id, n - 1); if (!muted) chime(false); setBump((b) => b + 1); };
  const moreTarget = otherGroups.length === 1 ? otherGroups[0] : "*";
  const cartLines = services.filter((s) => cart[s.id] > 0).map((s) => ({ service: s, qty: cart[s.id] }));
  const cartTotal = cartLines.reduce((t, l) => ({ minutes: t.minutes + l.service.duration_minutes * l.qty, price: t.price + l.service.price * l.qty }), { minutes: 0, price: 0 });
  const setQty = (id, n) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.min(20, n)) }));
  const startCart = () => {
    setService({ id: "cart", name: cartTitle(cartLines), duration_minutes: cartTotal.minutes, price: cartTotal.price, color: "rose", questions: [], items: cartLines.map((l) => ({ service: l.service.id, qty: l.qty })) });
    setAnswers({}); setSlots(null); setSlot(null); setDay(null);
    go(2);
  };
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
  // Distance limit: the address comes first, slots are filtered around it
  const geo = Boolean(org.max_km);
  const [where, setWhere] = useState("");
  const [place, setPlace] = useState(null);
  const [geoSkip, setGeoSkip] = useState(false);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoMisses, setGeoMisses] = useState(0);
  const needsPlace = geo && !place && !geoSkip;

  const needsAnswers = (service?.questions ?? []).filter((q) => q.required && !String(answers[q.id] ?? "").trim());
  const go = (n) => { setError(""); setStep(n); window.scrollTo({ top: 0, behavior: "smooth" }); };

  // Free slots for the chosen service (duration depends on the answers)
  useEffect(() => {
    if (step !== 2 || !service || needsPlace) return;
    let alive = true;
    const geoArgs = { _from: from, _days: WINDOW, _lat: place?.lat ?? null, _lng: place?.lng ?? null };
    const req = service.items
      ? db.rpc("get_booking_slots_cart", { _slug: org.slug, _items: service.items, ...geoArgs })
      : db.rpc("get_booking_slots_near", { _slug: org.slug, _service: service.id, _answers: answers, ...geoArgs });
    req.then(({ data, error: e }) => {
      if (!alive) return;
      if (e) { setError("לא הצלחנו לטעון שעות פנויות. נסו לרענן את הדף."); setSlots([]); return; }
      const list = data.map((s) => ({ start: s.slot_start, end: s.slot_end, near: s.near }));
      setSlots(list);
      setDay((d) => (d && list.some((s) => localParts(s.start).day === d) ? d : list[0] ? localParts(list[0].start).day : null));
    });
    return () => { alive = false; };
  }, [step, service, answers, from, org.slug, db, reload, needsPlace, place]);

  const locate = async () => {
    setGeoBusy(true); setError("");
    const res = await fetch(`/api/geocode?q=${encodeURIComponent(where)}`).catch(() => null);
    const body = await res?.json().catch(() => null);
    setGeoBusy(false);
    if (res?.ok && body) {
      setPlace(body); setSlots(null); setSlot(null);
      setForm((f) => ({ ...f, address: f.address || where.trim() }));
      return;
    }
    if (res?.status === 404) {
      setGeoMisses((n) => n + 1);
      setError("לא מצאנו את הכתובת במפה. נסו לכתוב רחוב ועיר, למשל: הרצל 12, רמת גן");
      return;
    }
    // Map service down: show every free slot rather than block the booking
    setGeoSkip(true); setForm((f) => ({ ...f, address: f.address || where.trim() }));
  };

  const days = useMemo(() => Array.from({ length: WINDOW }, (_, i) => addDays(from, i)), [from]);
  const byDay = useMemo(() => {
    const m = {};
    for (const s of slots ?? []) (m[localParts(s.start).day] ||= []).push(s);
    return m;
  }, [slots]);
  const nearDays = useMemo(() => new Set((slots ?? []).filter((s) => s.near).map((s) => localParts(s.start).day)), [slots]);
  const daySlots = (day && byDay[day]) || [];
  const nearSlots = daySlots.filter((s) => s.near);
  const parts = [
    { label: "אנחנו כבר באזור שלך", icon: MapPin, near: true, items: nearSlots },
    { label: "בוקר", icon: Sun, items: daySlots.filter((s) => localParts(s.start).hour < 12) },
    { label: "צהריים", icon: Sunset, items: daySlots.filter((s) => { const h = localParts(s.start).hour; return h >= 12 && h < 17; }) },
    { label: "ערב", icon: Moon, items: daySlots.filter((s) => localParts(s.start).hour >= 17) },
  ].map((p) => (p.near ? p : { ...p, items: p.items.filter((s) => !s.near) })).filter((p) => p.items.length);
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
      body: JSON.stringify({ slug: org.slug, ...(service.items ? { items: service.items } : { serviceId: service.id, answers }), startsAt: slot.start, ...form, ...(place ? { lat: place.lat, lng: place.lng } : {}) }),
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

  const reset = () => { setService(null); setAnswers({}); setSlot(null); setSlots(null); setResult(null); setForm({ name: "", phone: "", address: "", email: "", notes: "" }); setPlace(null); setWhere(""); setGeoSkip(false); setGeoMisses(0); setGroup(null); setCart({}); go(0); };
  // Book the other group right after: same customer, same address
  const bookAlso = (g) => { setService(null); setAnswers({}); setSlot(null); setSlots(null); setResult(null); setGroup(g); setHintOff(true); go(0); };
  const c = serviceColor(service?.color);

  return (
    <main dir="rtl" className={`relative min-h-screen overflow-clip bg-[#fdf8fa] px-4 pt-8 sm:pb-16 sm:pt-12 ${org.whatsapp ? "pb-28" : "pb-16"}`}>
      <div aria-hidden className="pointer-events-none absolute -end-32 -top-32 h-96 w-96 rounded-full bg-rose-300/30 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -start-32 h-[28rem] w-[28rem] rounded-full bg-violet-300/25 blur-3xl" />

      <div className="relative mx-auto w-full max-w-2xl">
        <header className="mb-7 flex animate-fade-up flex-col items-center text-center">
          {org.logo ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- data: URL from the org row */}
              <img src={org.logo} alt={org.name} className="h-28 w-28 rounded-full object-contain shadow-xl shadow-slate-900/20 sm:h-32 sm:w-32" />
              <h1 className="sr-only">{org.name}</h1>
            </>
          ) : (
            <>
              <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-rose-500 to-pink-500 text-2xl font-bold text-white shadow-xl shadow-rose-500/30">{org.name[0]}</span>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{org.name}</h1>
            </>
          )}
          <p className="mt-1.5 max-w-md text-base text-slate-500">{org.headline || "קביעת תור אונליין, בכמה קליקים"}</p>
        </header>

        {step < 4 && <div className="mb-6 animate-fade-up" style={{ animationDelay: "60ms" }}><Stepper step={step} /></div>}

        <section key={step} className="animate-pop-in rounded-[2rem] border border-slate-200/80 bg-white/90 p-5 shadow-2xl shadow-slate-900/10 backdrop-blur sm:p-8">
          {error && (
            <div role="alert" className="mb-5 flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-[15px] font-medium text-red-700"><CircleAlert size={19} className="mt-0.5 shrink-0" />{error}</div>
          )}
          {otherGroups.length > 0 && !hintOff && step < 4 && (
            <div className="mb-5 flex animate-fade-up items-center gap-2.5 rounded-2xl bg-gradient-to-l from-amber-50 to-rose-50 px-4 py-2.5 text-[15px] text-slate-700 ring-1 ring-amber-100">
              <Sparkles size={18} className="shrink-0 text-amber-500" />
              <span className="min-w-0 flex-1"><span className="font-semibold">יש גם {otherGroups.join(" ו")}!</span>{step === 0 ? "" : " אפשר להוסיף לאותו ביקור."}</span>
              {step < 3 && <button type="button" onClick={() => { setGroup(moreTarget); if (step) go(0); }} className="shrink-0 font-semibold text-rose-600 hover:underline">להוסיף לסל</button>}
              <button type="button" onClick={() => setHintOff(true)} aria-label="סגירה" className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-600">✕</button>
            </div>
          )}

          {step === 0 && grouped && !group && (
            <>
              <h2 className="text-2xl font-bold text-slate-900">במה נוכל לעזור?</h2>
              <p className="mt-1 text-base text-slate-500">בחרו מה לנקות, ונראה לכם את השירותים המתאימים.</p>
              <div className="mt-6 flex flex-col gap-3">
                {[...groups.map((g) => ({ id: g, label: g })), { id: "*", label: comboLabel(groups) }].map((g, i) => (
                  <button key={g.id} onClick={() => setGroup(g.id)} style={{ animationDelay: `${i * 70}ms` }}
                    className="group flex animate-fade-up items-center gap-4 rounded-3xl border-2 border-slate-100 bg-white p-5 text-start shadow-sm transition duration-300 hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-xl active:scale-[0.98]">
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${g.id === "*" ? "from-amber-400 to-rose-500" : i % 2 ? "from-violet-500 to-fuchsia-500" : "from-sky-500 to-blue-600"} text-white shadow-md transition group-hover:-rotate-6 group-hover:scale-110`}><Sparkles size={22} /></span>
                    <span className="flex-1 text-lg font-bold text-slate-900">{g.label}</span>
                    <ChevronLeft size={22} className="text-slate-300 transition group-hover:-translate-x-1 group-hover:text-rose-500" />
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 0 && cartMode && (
            <>
              <button onClick={() => setGroup(null)} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-rose-600"><ArrowRight size={16} />{group === "*" ? comboLabel(groups) : group}</button>
              <h2 className="text-2xl font-bold text-slate-900">מה מנקים הפעם?</h2>
              <p className="mt-1 text-base text-slate-500">הוסיפו לסל כל מה שצריך לביקור אחד, בכל כמות.</p>
              {cartShown.map((g) => {
                const list = services.filter((s) => (g ? s.category?.trim() === g : !s.category?.trim()));
                if (!list.length) return null;
                return (
                  <div key={g ?? "other"} className="mt-6">
                    {g && group === "*" && <div className="mb-2.5 text-sm font-bold uppercase tracking-wide text-slate-400">{g}</div>}
                    <div className="flex flex-col gap-2.5">
                      {list.map((s, i) => {
                        const n = cart[s.id] ?? 0;
                        return (
                          <div key={s.id} style={{ animationDelay: `${i * 50}ms` }}
                            className={`flex animate-fade-up items-center gap-3 rounded-2xl border-2 p-3.5 transition duration-200 ${n ? "border-rose-300 bg-rose-50/60 shadow-md shadow-rose-500/10" : "border-slate-100 bg-white"}`}>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 text-[16px] font-bold text-slate-900">
                                {n > 0 && <Check size={16} strokeWidth={3} className="shrink-0 animate-pop-in text-rose-500" />}{s.name}
                              </div>
                              {s.description && <div className="mt-0.5 line-clamp-1 text-sm text-slate-500">{s.description}</div>}
                              <div className="mt-1 flex items-center gap-3 text-sm font-semibold text-slate-500">
                                <span className="text-emerald-600">{ils(s.price)}</span>
                                <span className="flex items-center gap-1"><Timer size={14} />{minutesLabel(s.duration_minutes)}</span>
                              </div>
                            </div>
                            {n === 0 ? (
                              <button type="button" onClick={(e) => addOne(s, e, 0)} aria-label={`הוספת ${s.name}`}
                                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/30 transition hover:scale-105 active:scale-90">
                                <Plus size={24} strokeWidth={2.75} />
                              </button>
                            ) : (
                              <div className="flex shrink-0 items-center gap-1 rounded-full bg-white p-1 shadow-sm ring-1 ring-rose-200">
                                <button type="button" onClick={() => removeOne(s, n)} aria-label="פחות" className="flex h-10 w-10 items-center justify-center rounded-full text-rose-600 transition hover:bg-rose-50 active:scale-90"><Minus size={20} strokeWidth={2.75} /></button>
                                <span key={n} className="w-7 animate-pop-in text-center text-xl font-bold tabular-nums text-slate-900">{n}</span>
                                <button type="button" onClick={(e) => addOne(s, e, n)} disabled={n >= 20} aria-label="עוד" className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500 text-white transition hover:bg-rose-600 active:scale-90 disabled:opacity-40"><Plus size={20} strokeWidth={2.75} /></button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div className={`sticky z-10 mt-6 rounded-2xl bg-slate-900 p-4 text-white shadow-2xl transition ${org.whatsapp ? "bottom-24 sm:bottom-4" : "bottom-4"}`}>
                <div className="flex items-center gap-3">
                  <span ref={bagRef} key={bump} className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 ${bump ? "animate-wiggle" : ""}`}>
                    <ShoppingBag size={22} />
                    {cartLines.length > 0 && <span className="absolute -end-1.5 -top-1.5 flex h-5 min-w-5 animate-pop-in items-center justify-center rounded-full bg-rose-500 px-1 text-xs font-bold tabular-nums">{cartLines.reduce((t, l) => t + l.qty, 0)}</span>}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-bold">סל השירותים</div>
                    <div className="text-sm text-white/70">{cartLines.length ? `${cartLines.reduce((t, l) => t + l.qty, 0)} פריטים · ${minutesLabel(cartTotal.minutes)}` : "לחצו + כדי להוסיף לסל"}</div>
                  </div>
                  <button type="button" onClick={toggleMute} aria-label={muted ? "הפעלת צלילים" : "השתקת צלילים"} aria-pressed={!muted}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white">
                    {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                </div>
                {cartLines.length > 0 && (
                  <>
                    <div className="mt-3 line-clamp-2 text-[15px] font-semibold">{cartTitle(cartLines)}</div>
                    <button onClick={startCart} disabled={cartTotal.minutes > 16 * 60}
                      className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-rose-500 to-pink-500 text-base font-bold shadow-lg transition active:scale-[0.98] disabled:opacity-50">
                      <span key={cartTotal.price} className="animate-pop-in tabular-nums">{ils(cartTotal.price)}</span> · לבחירת מועד<ArrowLeft size={19} />
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {step === 0 && (!grouped || (group && !cartMode)) && (
            <>
              {grouped && <button onClick={() => setGroup(null)} className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-rose-600"><ArrowRight size={16} />{group === "*" ? comboLabel(groups) : group}</button>}
              <h2 className="text-2xl font-bold text-slate-900">איזה שירות תרצו להזמין?</h2>
              <p className="mt-1 text-base text-slate-500">בחרו שירות, ובשלב הבא נשאל כמה שאלות קצרות.</p>
              {shown.length === 0 && <p className="mt-6 rounded-2xl bg-amber-50 px-4 py-3 text-amber-700">אין כרגע שירותים פתוחים להזמנה. נסו שוב מאוחר יותר.</p>}
              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {shown.map((s, i) => {
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
              <h2 className="text-2xl font-bold text-slate-900">{needsPlace ? "לאן מגיעים?" : "מתי נוח לכם?"}</h2>
              <div className="mt-2"><QuoteBar service={service} answers={answers} /></div>

              {needsPlace && (
                <form className="mt-6 flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); if (where.trim().length >= 3 && !geoBusy) locate(); }}>
                  <p className="text-base text-slate-500">כתבו את כתובת הביקור, ונראה לכם את המועדים שמתאימים לאזור שלכם.</p>
                  <input className={input} autoFocus autoComplete="street-address" value={where} onChange={(e) => setWhere(e.target.value)} placeholder="רחוב, מספר בית, עיר" />
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    {geoMisses >= 2 ? (
                      <button type="button" onClick={() => { setGeoSkip(true); setError(""); setForm((f) => ({ ...f, address: f.address || where.trim() })); }} className="text-[15px] font-semibold text-slate-500 hover:text-rose-600 hover:underline">להמשיך בלי לאתר את הכתובת</button>
                    ) : <span />}
                    <NextBtn disabled={where.trim().length < 3} busy={geoBusy}>הצגת מועדים</NextBtn>
                  </div>
                </form>
              )}

              {!needsPlace && (<>
              {place && (
                <div className="mt-4 flex items-center gap-2 rounded-2xl bg-slate-50 px-4 py-2.5 text-[15px] text-slate-600">
                  <MapPin size={17} className="shrink-0 text-rose-500" />
                  <span className="min-w-0 flex-1 truncate">{where.trim()}</span>
                  <button type="button" onClick={() => { setPlace(null); setSlots(null); setSlot(null); }} className="shrink-0 font-semibold text-rose-600 hover:underline">שינוי</button>
                </div>
              )}

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
                        {nearDays.has(d)
                          ? <MapPin size={11} className={`mt-0.5 ${active ? "text-white" : "text-rose-500"}`} aria-label="כבר באזור שלך" />
                          : <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${n ? (active ? "bg-white" : "bg-emerald-400") : "bg-transparent"}`} />}
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
                  <div key={p.label} className={p.near ? "mb-5 rounded-2xl bg-rose-50/70 p-3 ring-1 ring-rose-100" : "mb-4"}>
                    <div className={`mb-2 flex items-center gap-1.5 text-sm font-semibold ${p.near ? "text-rose-600" : "text-slate-500"}`}><p.icon size={16} />{p.label}</div>
                    <div className={`grid gap-2 ${org.windowed ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-3 sm:grid-cols-4"}`}>
                      {p.items.map((s, i) => (
                        <button key={s.start} onClick={() => setSlot(s)} aria-pressed={slot?.start === s.start} style={{ animationDelay: `${i * 25}ms` }}
                          className={`h-12 animate-pop-in rounded-2xl border-2 text-base font-bold tabular-nums transition duration-200 active:scale-95 ${slot?.start === s.start ? "border-rose-400 bg-gradient-to-l from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-500/30" : "border-slate-100 bg-white text-slate-700 hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md"}`}>
                          <bdi dir="ltr">{slotLabel({ ...s, window: org.windowed })}</bdi>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              </>)}

              <div className="mt-6 flex flex-col-reverse items-center justify-between gap-3 sm:flex-row">
                <button onClick={() => go(service.questions?.length ? 1 : 0)} className="inline-flex items-center gap-1.5 text-base font-semibold text-slate-500 transition hover:text-rose-600"><ArrowRight size={18} />חזרה</button>
                {!needsPlace && <NextBtn disabled={!slot} onClick={() => go(3)}>{slot ? `${fmtDay(localParts(slot.start).day, { weekday: "short", day: "numeric", month: "numeric" })} · ${slotLabel({ ...slot, window: org.windowed })}` : "בחרו שעה"}</NextBtn>}
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

              {otherGroups.length > 0 && (
                <button onClick={() => bookAlso(otherGroups[0])}
                  className="mt-6 flex w-full animate-fade-up items-center gap-3 rounded-2xl bg-gradient-to-l from-amber-50 to-rose-50 px-4 py-3.5 text-start ring-1 ring-amber-100 transition hover:-translate-y-0.5 hover:shadow-md" style={{ animationDelay: "420ms" }}>
                  <Sparkles size={20} className="shrink-0 text-amber-500" />
                  <span className="flex-1 text-[15px] text-slate-700"><span className="font-bold">יש גם {otherGroups[0]}!</span> לקבוע עכשיו, עם אותם פרטים?</span>
                  <ChevronLeft size={20} className="text-rose-500" />
                </button>
              )}

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
      <WhatsAppFab org={org} />
    </main>
  );
}
