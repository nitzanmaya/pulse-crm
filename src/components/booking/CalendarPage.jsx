"use client";

import React, { useMemo, useState, useEffect } from "react";
import {
  CalendarDays, ChevronRight, ChevronLeft, Plus, Clock, Mail, User, Check, X, Trash2, Wrench,
  Sparkles, ListChecks, Settings2, Link2, Copy, ExternalLink, Ban, RefreshCw, Coins, Timer, CircleSlash,
  MessageCircle, CalendarCheck, Wand2, GripVertical, CalendarX2, Globe, ArrowLeft,
} from "lucide-react";
import { Card, Btn, Field, inputCls, SectionTitle, Modal, Toggle, ICON_NUDGE } from "@/components/ui";
import {
  quote, localParts, zonedToUtc, todayKey, addDays, dowOf, fmtTime, fmtDate, fmtDay, WEEKDAYS_HE, WEEKDAYS_SHORT,
  minutesLabel, EXAMPLE_SERVICES, SERVICE_COLORS, serviceColor,
} from "@/lib/booking/shared";

const ils = (n) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
const ACTIVE = ["pending", "confirmed"];
const STATUS = {
  pending: { label: "ממתין", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  confirmed: { label: "מאושר", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  completed: { label: "בוצע", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  cancelled: { label: "בוטל", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  no_show: { label: "לא הגיע", cls: "bg-red-50 text-red-600 border-red-200" },
};
const SOURCE = { booking_page: "דף הזמנה", whatsapp_bot: "בוט WhatsApp", manual: "ידני" };
const HOUR_PX = 60;
const hhmm = (t) => t.slice(0, 5);
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const weekStartOf = (day) => addDays(day, -dowOf(day));

// Pushes new/moved/cancelled appointments to Google Calendar when one is connected
const syncCalendar = (org) => (org.calendars.some((c) => c.status === "active") ? fetch("/api/calendar/google/sync", { method: "POST" }).catch(() => {}) : Promise.resolve());

const StatusChip = ({ status }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS[status].cls}`}>{STATUS[status].label}</span>
);

function Tabs({ tab, setTab }) {
  const items = [
    { id: "week", label: "יומן", icon: CalendarDays },
    { id: "services", label: "שירותים", icon: ListChecks },
    { id: "availability", label: "זמינות", icon: Clock },
    { id: "page", label: "דף הזמנה וסנכרון", icon: Link2 },
  ];
  return (
    <div className="flex gap-1 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200/80" role="tablist">
      {items.map((t) => (
        <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
          className={`flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-[15px] font-semibold transition duration-200 ${tab === t.id ? "bg-gradient-to-l from-rose-500 to-pink-500 text-white shadow-md shadow-rose-500/25" : "text-slate-600 hover:bg-rose-50 hover:text-rose-700"}`}>
          <t.icon size={17} />{t.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Week calendar                                                      */
/* ------------------------------------------------------------------ */

function useNow(ms = 60000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

function WeekView({ org, onOpen, onNew, canEdit }) {
  const [week, setWeek] = useState(() => weekStartOf(todayKey()));
  const [showCancelled, setShowCancelled] = useState(false);
  const now = useNow();
  const today = todayKey();
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const svcById = useMemo(() => Object.fromEntries(org.services.map((s) => [s.id, s])), [org.services]);

  // Visible hours follow the opening hours (07:00-20:00 when none)
  const ruleMins = org.rules.flatMap((r) => [toMin(r.start_time), toMin(r.end_time)]);
  const startHour = Math.max(0, Math.min(7, Math.floor((ruleMins.length ? Math.min(...ruleMins) : 420) / 60)));
  const endHour = Math.min(24, Math.max(20, Math.ceil((ruleMins.length ? Math.max(...ruleMins) : 1200) / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  const byDay = useMemo(() => {
    const m = {};
    for (const a of org.appointments) {
      if (!showCancelled && !ACTIVE.includes(a.status) && a.status !== "completed") continue;
      const p = localParts(a.starts_at);
      (m[p.day] ||= []).push({ ...a, _p: p, _end: localParts(a.ends_at) });
    }
    return m;
  }, [org.appointments, showCancelled]);

  const weekAppts = days.flatMap((d) => (byDay[d] || []).filter((a) => ACTIVE.includes(a.status) || a.status === "completed"));
  const weekRevenue = weekAppts.filter((a) => a.status !== "cancelled").reduce((s, a) => s + Number(a.price), 0);
  const nowP = localParts(new Date(now));
  const blockedOn = (d) => org.blocks.find((b) => d >= b.starts_on && d <= b.ends_on);
  const upcoming = org.appointments.filter((a) => ACTIVE.includes(a.status) && new Date(a.ends_at).getTime() > now).slice(0, 6);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { icon: CalendarCheck, tone: "from-rose-400 to-pink-500", label: "תורים היום", value: (byDay[today] || []).filter((a) => ACTIVE.includes(a.status)).length },
          { icon: CalendarDays, tone: "from-violet-400 to-indigo-500", label: "תורים השבוע", value: weekAppts.length },
          { icon: Coins, tone: "from-emerald-400 to-teal-500", label: "הכנסה צפויה השבוע", value: ils(weekRevenue) },
          { icon: Globe, tone: "from-amber-400 to-orange-500", label: "הוזמנו אונליין", value: org.appointments.filter((a) => a.source !== "manual").length },
        ].map((k, i) => (
          <Card key={k.label} className="group flex animate-fade-up items-center gap-3 p-4 transition duration-300 hover:-translate-y-0.5 hover:shadow-lg" style={{ animationDelay: `${i * 60}ms` }}>
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${k.tone} text-white shadow-md transition group-hover:-rotate-6 group-hover:scale-110`}><k.icon size={20} /></span>
            <span className="min-w-0">
              <span className="block truncate text-sm text-slate-500">{k.label}</span>
              <span className="block text-xl font-bold tabular-nums text-slate-900">{k.value}</span>
            </span>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 2xl:grid-cols-[1fr_320px]">
        <Card className="animate-fade-up overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
            <div className="flex items-center gap-1">
              <button onClick={() => setWeek(addDays(week, -7))} aria-label="שבוע קודם" className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"><ChevronRight size={20} /></button>
              <button onClick={() => setWeek(addDays(week, 7))} aria-label="שבוע הבא" className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"><ChevronLeft size={20} /></button>
            </div>
            <h3 className="text-base font-bold text-slate-800">{fmtDay(days[0], { day: "numeric", month: "long" })} – {fmtDay(days[6], { day: "numeric", month: "long", year: "numeric" })}</h3>
            {week !== weekStartOf(today) && (
              <button onClick={() => setWeek(weekStartOf(today))} className="rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-600 transition hover:bg-rose-100">היום</button>
            )}
            <label className="ms-auto flex cursor-pointer items-center gap-2 text-sm text-slate-500">
              <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} className="h-4 w-4 accent-rose-500" />
              הצגת מבוטלים
            </label>
            {canEdit && <Btn onClick={() => onNew()} className="h-10 px-4 text-sm"><Plus size={17} />תור חדש</Btn>}
          </div>

          <div className="overflow-x-auto">
            <div className="grid min-w-[860px]" style={{ gridTemplateColumns: "56px repeat(7, minmax(0, 1fr))" }}>
              <div className="sticky top-0 z-10 border-b border-slate-100 bg-white" />
              {days.map((d) => {
                const isToday = d === today;
                const n = (byDay[d] || []).filter((a) => ACTIVE.includes(a.status)).length;
                return (
                  <div key={d} className={`border-b border-s border-slate-100 px-2 py-2.5 text-center ${isToday ? "bg-rose-50/70" : "bg-white"}`}>
                    <div className={`text-xs font-semibold ${isToday ? "text-rose-600" : "text-slate-500"}`}>{WEEKDAYS_HE[dowOf(d)]}</div>
                    <div className={`mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-base font-bold tabular-nums ${isToday ? "bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-md shadow-rose-500/30" : "text-slate-800"}`}>{Number(d.slice(8))}</div>
                    <div className="mt-0.5 h-4 text-[11px] font-medium text-slate-400">{n ? `${n} תורים` : ""}</div>
                  </div>
                );
              })}

              <div className="relative">
                {hours.map((h) => (
                  <div key={h} className="relative text-[11px] font-medium tabular-nums text-slate-400" style={{ height: HOUR_PX }}>
                    <span className="absolute -top-2 end-2">{String(h).padStart(2, "0")}:00</span>
                  </div>
                ))}
              </div>
              {days.map((d) => {
                const rules = org.rules.filter((r) => r.weekday === dowOf(d));
                const block = blockedOn(d);
                const isToday = d === today;
                return (
                  <div key={d} className={`relative border-s border-slate-100 ${isToday ? "bg-rose-50/30" : ""}`} style={{ height: hours.length * HOUR_PX }}
                    onDoubleClick={(e) => {
                      if (!canEdit) return;
                      const r = e.currentTarget.getBoundingClientRect();
                      const mins = Math.floor(((e.clientY - r.top) / HOUR_PX) * 2) * 30 + startHour * 60;
                      onNew(d, `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`);
                    }}>
                    {/* closed hours are hatched; open windows are white */}
                    <div aria-hidden className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(148,163,184,0.10)_6px,rgba(148,163,184,0.10)_12px)]" />
                    {!block && rules.map((r, i) => (
                      <div key={i} aria-hidden className={`absolute inset-x-0 ${isToday ? "bg-rose-50/60" : "bg-white"}`}
                        style={{ top: ((toMin(r.start_time) - startHour * 60) / 60) * HOUR_PX, height: ((toMin(r.end_time) - toMin(r.start_time)) / 60) * HOUR_PX }} />
                    ))}
                    {hours.map((h) => <div key={h} aria-hidden className="absolute inset-x-0 border-t border-slate-100" style={{ top: (h - startHour) * HOUR_PX }} />)}
                    {block && (
                      <div className="absolute inset-x-1 top-2 flex items-center justify-center gap-1 rounded-lg bg-slate-100 px-2 py-1.5 text-xs font-semibold text-slate-500">
                        <Ban size={13} />{block.reason || "יום חסום"}
                      </div>
                    )}
                    {isToday && nowP.hour >= startHour && nowP.hour < endHour && (
                      <div aria-hidden className="absolute inset-x-0 z-20 flex items-center" style={{ top: ((nowP.hour * 60 + nowP.minute - startHour * 60) / 60) * HOUR_PX }}>
                        <span className="h-2.5 w-2.5 -translate-x-1 animate-heartbeat rounded-full bg-rose-500" />
                        <span className="h-0.5 flex-1 bg-rose-500/80" />
                      </div>
                    )}
                    {(byDay[d] || []).map((a) => {
                      const svc = svcById[a.service_id];
                      const c = serviceColor(svc?.color);
                      const top = ((a._p.hour * 60 + a._p.minute - startHour * 60) / 60) * HOUR_PX;
                      const endMin = a._end.day === d ? a._end.hour * 60 + a._end.minute : 24 * 60;
                      const height = Math.max(26, ((endMin - (a._p.hour * 60 + a._p.minute)) / 60) * HOUR_PX - 3);
                      const dim = !ACTIVE.includes(a.status) && a.status !== "completed";
                      return (
                        <button key={a.id} onClick={() => onOpen(a)} title={`${a.customer_name} · ${svc?.name ?? ""}`}
                          className={`group absolute inset-x-1 z-10 animate-pop-in overflow-hidden rounded-xl border-s-4 ${c.border} ${c.soft} px-2 py-1 text-start shadow-sm ring-1 ring-black/5 transition duration-200 hover:z-30 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-200 ${dim ? "opacity-50 line-through" : ""}`}
                          style={{ top: Math.max(0, top) + 1, height }}>
                          <div className={`truncate text-xs font-bold ${c.text}`}>{fmtTime(a.starts_at)} · {a.customer_name}</div>
                          {height > 40 && <div className="truncate text-[11px] text-slate-600">{svc?.name ?? "תור"}{a.address ? ` · ${a.address}` : ""}</div>}
                          {a.status === "completed" && <Check size={13} className="absolute bottom-1 end-1 text-sky-600" />}
                          {a.source !== "manual" && height > 56 && (
                            <span className="absolute bottom-1 start-2 text-[10px] font-semibold text-slate-400">{SOURCE[a.source]}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
          {canEdit && <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-400">טיפ: לחיצה כפולה על משבצת ביומן פותחת תור חדש בשעה הזו.</p>}
        </Card>

        <Card className="h-fit animate-fade-up p-5" style={{ animationDelay: "80ms" }}>
          <SectionTitle icon={Sparkles} color="text-violet-500">התורים הבאים</SectionTitle>
          {upcoming.length === 0 && <p className="mt-3 text-sm text-slate-500">אין תורים קרובים. שתפו את דף ההזמנה עם הלקוחות, והתורים יופיעו כאן.</p>}
          <ul className="mt-3 flex flex-col gap-2">
            {upcoming.map((a) => {
              const svc = svcById[a.service_id];
              const c = serviceColor(svc?.color);
              return (
                <li key={a.id}>
                  <button onClick={() => onOpen(a)} className="flex w-full items-center gap-3 rounded-xl p-2 text-start transition hover:bg-slate-50">
                    <span className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br ${c.grad} text-white shadow-sm`}>
                      <span className="text-[10px] font-semibold leading-none opacity-90">{WEEKDAYS_SHORT[localParts(a.starts_at).dow]}</span>
                      <span className="text-sm font-bold leading-tight">{fmtTime(a.starts_at)}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-slate-800">{a.customer_name}</span>
                      <span className="block truncate text-xs text-slate-500">{svc?.name ?? "תור"} · {fmtDate(a.starts_at, { day: "numeric", month: "numeric" })}</span>
                    </span>
                    <StatusChip status={a.status} />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Appointment modal (new + details)                                  */
/* ------------------------------------------------------------------ */

function QuestionInput({ q, value, onChange, big }) {
  if (q.type === "number") {
    const n = Number(value) || q.min || 1;
    const set = (v) => onChange(String(Math.max(q.min ?? 1, Math.min(q.max ?? 50, v))));
    return (
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => set(n - 1)} aria-label="פחות" className={`flex ${big ? "h-12 w-12" : "h-10 w-10"} items-center justify-center rounded-xl border border-slate-200 bg-white text-xl font-bold text-slate-600 shadow-sm transition hover:border-rose-300 hover:text-rose-600 active:scale-90`}>−</button>
        <span className={`${big ? "w-14 text-2xl" : "w-10 text-lg"} text-center font-bold tabular-nums text-slate-900`}>{n}</span>
        <button type="button" onClick={() => set(n + 1)} aria-label="יותר" className={`flex ${big ? "h-12 w-12" : "h-10 w-10"} items-center justify-center rounded-xl border border-slate-200 bg-white text-xl font-bold text-slate-600 shadow-sm transition hover:border-rose-300 hover:text-rose-600 active:scale-90`}>+</button>
      </div>
    );
  }
  if (q.type === "select") {
    return (
      <div className="flex flex-wrap gap-2">
        {(q.options || []).map((o) => (
          <button key={o} type="button" onClick={() => onChange(o)} aria-pressed={value === o}
            className={`rounded-full border px-4 py-2 text-[15px] font-medium transition duration-200 active:scale-95 ${value === o ? "border-rose-300 bg-rose-50 text-rose-700 shadow-sm" : "border-slate-200 bg-white text-slate-600 hover:border-rose-200"}`}>{o}</button>
        ))}
      </div>
    );
  }
  return <input className={inputCls} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
}

function AppointmentModal({ appt, org, db, userId, canEdit, isAdmin, notify, fail, patchOrg, onClose, onOpenLead }) {
  const isNew = !appt.id;
  const [d, setD] = useState(() => {
    const p = appt.starts_at ? localParts(appt.starts_at) : null;
    return {
      service_id: appt.service_id ?? org.services.find((s) => s.is_active)?.id ?? "",
      day: p?.day ?? appt.day ?? todayKey(),
      time: p ? `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}` : appt.time ?? "09:00",
      customer_name: appt.customer_name ?? "",
      phone: appt.phone ?? "",
      email: appt.email ?? "",
      address: appt.address ?? "",
      notes: appt.notes ?? "",
      answers: appt.answers ?? {},
      status: appt.status ?? "confirmed",
    };
  });
  const [busy, setBusy] = useState(false);
  const svc = org.services.find((s) => s.id === d.service_id);
  const q = svc ? quote(svc, d.answers) : { minutes: 60, price: 0 };
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  const jobs = org.jobs.filter((j) => j.appointment_id === appt.id);
  const lead = org.leads.find((l) => l.id === appt.lead_id);
  const editable = canEdit && (isNew || ACTIVE.includes(appt.status));

  const save = async () => {
    if (!d.customer_name.trim()) return;
    setBusy(true);
    const start = zonedToUtc(d.day, d.time);
    const end = new Date(start.getTime() + (isNew || d.service_id !== appt.service_id ? q.minutes : (new Date(appt.ends_at) - new Date(appt.starts_at)) / 60000) * 60000);
    let leadId = appt.lead_id ?? null;
    const digits = d.phone.replace(/\D/g, "");
    if (isNew && digits) {
      leadId = org.leads.find((l) => l.phone.replace(/\D/g, "") === digits)?.id ?? null;
      if (!leadId) {
        const { data: nl, error: le } = await db.from("leads").insert({ org_id: org.id, title: d.customer_name.trim(), contact_name: d.customer_name.trim(), phone: d.phone, email: d.email || null, value: q.price, source: "תור ידני", stage: "new" }).select().single();
        if (!le) {
          leadId = nl.id;
          patchOrg((o) => ({ ...o, leads: [{ id: nl.id, name: nl.title, contact: nl.contact_name ?? "", phone: nl.phone ?? "", email: nl.email ?? "", value: Number(nl.value), stage: nl.stage, owner: nl.assignee_id, tags: [], source: nl.source ?? "", created: nl.created_at.slice(0, 10), note: "", birthday: "", serviceMonths: null, lastService: "" }, ...o.leads] }));
        }
      }
    }
    const row = {
      service_id: d.service_id || null,
      customer_name: d.customer_name.trim(),
      phone: d.phone || null,
      email: d.email || null,
      address: d.address || null,
      notes: d.notes || null,
      answers: d.answers,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      ...(isNew ? { org_id: org.id, lead_id: leadId, price: q.price, source: "manual", status: d.status, assignee_id: userId } : {}),
    };
    const { data, error } = isNew
      ? await db.from("appointments").insert(row).select().single()
      : await db.from("appointments").update(row).eq("id", appt.id).select().single();
    setBusy(false);
    if (error) return fail(error, error.code === "23P01" ? "השעה הזו כבר תפוסה ביומן" : "שמירת התור נכשלה");
    patchOrg((o) => ({ ...o, appointments: (isNew ? [...o.appointments, data] : o.appointments.map((a) => (a.id === data.id ? data : a))).sort((a, b) => (a.starts_at < b.starts_at ? -1 : 1)) }));
    syncCalendar(org);
    notify(isNew ? `התור של ${data.customer_name} נקבע ל${fmtDate(data.starts_at, { weekday: "long", day: "numeric", month: "numeric" })} ב-${fmtTime(data.starts_at)}` : "התור עודכן");
    onClose();
  };

  const setStatus = async (status) => {
    setBusy(true);
    const { data, error } = await db.from("appointments").update({ status }).eq("id", appt.id).select().single();
    setBusy(false);
    if (error) return fail(error, error.code === "23P01" ? "השעה כבר תפוסה, אי אפשר לשחזר את התור" : "עדכון הסטטוס נכשל");
    patchOrg((o) => ({
      ...o,
      appointments: o.appointments.map((a) => (a.id === data.id ? data : a)),
      leads: status === "completed" && data.lead_id ? o.leads.map((l) => (l.id === data.lead_id ? { ...l, lastService: localParts(data.starts_at).day } : l)) : o.leads,
    }));
    syncCalendar(org);
    notify(status === "completed" ? "סומן כבוצע, השירות האחרון עודכן בכרטיס הלקוח" : status === "cancelled" ? "התור בוטל והתזכורות נעצרו" : "הסטטוס עודכן");
    onClose();
  };

  const remove = async () => {
    // Cancel first so the Google event is removed, then delete the row
    if (appt.google_event_id && org.calendars.some((c) => c.status === "active")) {
      await db.from("appointments").update({ status: "cancelled" }).eq("id", appt.id);
      await syncCalendar(org);
    }
    const { error } = await db.from("appointments").delete().eq("id", appt.id).select("id").single();
    if (error) return fail(error, "מחיקת התור נכשלה");
    patchOrg((o) => ({ ...o, appointments: o.appointments.filter((a) => a.id !== appt.id) }));
    notify("התור נמחק");
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={isNew ? "תור חדש" : "פרטי תור"} wide>
      {!isNew && (
        <div className="mb-5 flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-l from-rose-50 to-violet-50 p-4">
          <span className={`flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br ${serviceColor(svc?.color).grad} text-white shadow-md`}>
            <span className="text-[11px] font-semibold leading-none">{WEEKDAYS_HE[localParts(appt.starts_at).dow]}</span>
            <span className="text-lg font-bold leading-tight">{fmtTime(appt.starts_at)}</span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xl font-bold text-slate-900">{appt.customer_name}<StatusChip status={appt.status} /></div>
            <div className="text-sm text-slate-600">{svc?.name ?? "תור"} · {fmtDate(appt.starts_at, { weekday: "long", day: "numeric", month: "long" })} · <bdi dir="ltr">{fmtTime(appt.starts_at)}–{fmtTime(appt.ends_at)}</bdi></div>
            <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
              <span>מקור: {SOURCE[appt.source]}</span>
              <span>Google Calendar: {appt.sync_status === "synced" ? "מסונכרן" : appt.sync_status === "pending" ? "ממתין לסנכרון" : "לא מחובר"}</span>
            </div>
          </div>
          <div className="text-start">
            <div className="text-xs font-medium text-slate-500">מחיר</div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">{ils(appt.price)}</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="שירות">
          <select className={inputCls} value={d.service_id} onChange={(e) => setD({ ...d, service_id: e.target.value, answers: {} })} disabled={!editable}>
            {!org.services.length && <option value="">אין שירותים מוגדרים</option>}
            {org.services.map((s) => <option key={s.id} value={s.id}>{s.name} · {minutesLabel(s.duration_minutes)}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="תאריך"><input type="date" className={inputCls} value={d.day} onChange={set("day")} disabled={!editable} /></Field>
          <Field label="שעה"><input type="time" step={300} className={inputCls} value={d.time} onChange={set("time")} disabled={!editable} /></Field>
        </div>
        <Field label="שם הלקוח"><input className={inputCls} value={d.customer_name} onChange={set("customer_name")} disabled={!editable} placeholder="שם מלא" /></Field>
        <Field label="טלפון"><input dir="ltr" type="tel" className={inputCls} value={d.phone} onChange={set("phone")} disabled={!editable} placeholder="050-0000000" /></Field>
        <Field label="כתובת"><input className={inputCls} value={d.address} onChange={set("address")} disabled={!editable} placeholder="רחוב, מספר, עיר" /></Field>
        <Field label="אימייל"><input dir="ltr" type="email" className={inputCls} value={d.email} onChange={set("email")} disabled={!editable} /></Field>
      </div>

      {svc?.questions?.length > 0 && (
        <div className="mt-5 grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2">
          {svc.questions.map((qq) => (
            <Field key={qq.id} label={qq.label}>
              {editable ? <QuestionInput q={qq} value={d.answers[qq.id]} onChange={(v) => setD({ ...d, answers: { ...d.answers, [qq.id]: v } })} />
                : <span className="text-[15px] font-semibold text-slate-800">{d.answers[qq.id] || "—"}</span>}
            </Field>
          ))}
          {isNew && <p className="flex items-center gap-1.5 text-sm text-slate-500 sm:col-span-2"><Timer size={15} />משך משוער {minutesLabel(q.minutes)} · מחיר {ils(q.price)}</p>}
        </div>
      )}

      <div className="mt-4"><Field label="הערות"><textarea rows={2} className={inputCls} value={d.notes} onChange={set("notes")} disabled={!canEdit} /></Field></div>

      {!isNew && jobs.length > 0 && (
        <div className="mt-5">
          <span className="text-sm font-medium text-slate-600">הודעות אוטומטיות</span>
          <ul className="mt-2 flex flex-wrap gap-2">
            {jobs.map((j) => <li key={j.id}><JobChip job={j} /></li>)}
          </ul>
        </div>
      )}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {!isNew && canEdit && ACTIVE.includes(appt.status) && (
            <>
              <Btn variant="ghost" disabled={busy} onClick={() => setStatus("completed")}><Wrench size={17} />בוצע</Btn>
              <Btn variant="ghost" disabled={busy} onClick={() => setStatus("no_show")}><CircleSlash size={17} />לא הגיע</Btn>
              <Btn variant="danger" disabled={busy} onClick={() => setStatus("cancelled")}><X size={17} />ביטול תור</Btn>
            </>
          )}
          {!isNew && canEdit && !ACTIVE.includes(appt.status) && <Btn variant="ghost" disabled={busy} onClick={() => setStatus("confirmed")}><RefreshCw size={17} />החזרה ליומן</Btn>}
          {!isNew && isAdmin && <button onClick={remove} aria-label="מחיקת תור" className="rounded-xl p-2.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={18} /></button>}
        </div>
        <div className="flex gap-2">
          {lead && <Btn variant="ghost" onClick={() => { onClose(); onOpenLead(lead); }}><User size={17} />כרטיס לקוח</Btn>}
          {editable && <Btn disabled={busy || !d.customer_name.trim() || !d.service_id} onClick={save}><Check size={17} />{isNew ? "קביעת תור" : "שמירה"}</Btn>}
        </div>
      </div>
    </Modal>
  );
}

export function JobChip({ job }) {
  const s = {
    queued: ["ממתין", "bg-slate-100 text-slate-600"],
    sending: ["נשלח…", "bg-sky-50 text-sky-700"],
    sent: ["נשלח", "bg-emerald-50 text-emerald-700"],
    simulated: ["סימולציה", "bg-violet-50 text-violet-700"],
    failed: ["נכשל", "bg-red-50 text-red-600"],
    skipped: ["דולג", "bg-slate-100 text-slate-400"],
  }[job.status];
  const Icon = job.channel === "whatsapp" ? MessageCircle : Mail;
  return (
    <span title={job.error || ""} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${s[1]}`}>
      <Icon size={13} />{job.kind === "reminder" ? "תזכורת" : "אישור"} · {s[0]}
      {job.status === "queued" && <span className="font-normal opacity-80">({fmtDate(job.send_at, { day: "numeric", month: "numeric" })} {fmtTime(job.send_at)})</span>}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Services                                                           */
/* ------------------------------------------------------------------ */

const DURATIONS = [15, 30, 45, 60, 90, 120, 180, 240];
const newQuestionId = () => `q${crypto.randomUUID().slice(0, 8)}`;

function ServiceModal({ service, onClose, onSave, onDelete }) {
  const [s, setS] = useState(() => ({ ...service, questions: (service.questions || []).map((q) => ({ ...q, options: q.options || [] })) }));
  const setQ = (i, patch) => setS({ ...s, questions: s.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const addQ = (type) => setS({ ...s, questions: [...s.questions, { id: newQuestionId(), label: type === "number" ? "כמה יחידות?" : type === "select" ? "בחירה" : "שאלה", type, required: true, min: 1, max: 10, extra_minutes: 0, extra_price: 0, options: type === "select" ? ["אפשרות 1", "אפשרות 2"] : [] }] });
  const q1 = quote(s, {});
  const q3 = quote(s, Object.fromEntries(s.questions.filter((q) => q.type === "number").map((q) => [q.id, "3"])));
  const hasNum = s.questions.some((q) => q.type === "number" && (q.extra_minutes || q.extra_price));
  const clean = () => ({
    ...s,
    name: s.name.trim(),
    duration_minutes: Number(s.duration_minutes) || 60,
    price: Number(s.price) || 0,
    questions: s.questions.filter((q) => q.label.trim()).map((q) => {
      const base = { id: q.id, label: q.label.trim(), type: q.type, required: !!q.required };
      if (q.type === "number") return { ...base, min: Number(q.min) || 1, max: Number(q.max) || 10, extra_minutes: Number(q.extra_minutes) || 0, extra_price: Number(q.extra_price) || 0 };
      if (q.type === "select") return { ...base, options: q.options.map((o) => o.trim()).filter(Boolean) };
      return base;
    }),
  });
  return (
    <Modal open onClose={onClose} title={service.id ? "עריכת שירות" : "שירות חדש"} wide>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="שם השירות"><input autoFocus className={inputCls} value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="לדוגמה: ניקוי מזגן" /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="משך">
            <select className={inputCls} value={s.duration_minutes} onChange={(e) => setS({ ...s, duration_minutes: Number(e.target.value) })}>
              {[...new Set([...DURATIONS, Number(s.duration_minutes)])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{minutesLabel(m)}</option>)}
            </select>
          </Field>
          <Field label="מחיר (₪)"><input type="number" min="0" className={inputCls} value={s.price} onChange={(e) => setS({ ...s, price: e.target.value })} /></Field>
        </div>
        <div className="sm:col-span-2"><Field label="תיאור קצר (מוצג ללקוח)"><input className={inputCls} value={s.description ?? ""} onChange={(e) => setS({ ...s, description: e.target.value })} /></Field></div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <span className="text-sm font-medium text-slate-600">צבע ביומן</span>
          {Object.entries(SERVICE_COLORS).map(([k, c]) => (
            <button key={k} type="button" aria-label={k} aria-pressed={s.color === k} onClick={() => setS({ ...s, color: k })}
              className={`h-8 w-8 rounded-full bg-gradient-to-br ${c.grad} transition hover:scale-110 ${s.color === k ? "ring-4 ring-offset-2 ring-rose-200" : ""}`} />
          ))}
          <label className="ms-auto flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
            <input type="checkbox" checked={s.is_active} onChange={(e) => setS({ ...s, is_active: e.target.checked })} className="h-4 w-4 accent-rose-500" />
            מוצג בדף ההזמנה
          </label>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold text-slate-800"><Wand2 size={18} className="text-violet-500" />שאלות ללקוח</div>
            <p className="text-sm text-slate-500">נשאלות בשלב 2 של ההזמנה ובבוט. שאלת כמות יכולה להאריך את התור ולעדכן את המחיר.</p>
          </div>
          <div className="flex gap-1.5">
            {[["number", "כמות"], ["select", "בחירה"], ["text", "טקסט"]].map(([t, l]) => (
              <button key={t} type="button" onClick={() => addQ(t)} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-rose-300 bg-white px-2.5 py-1.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"><Plus size={14} />{l}</button>
            ))}
          </div>
        </div>
        {s.questions.length === 0 && <p className="mt-3 text-sm text-slate-400">אין שאלות. אפשר להוסיף למשל ״כמה מזגנים?״</p>}
        <ul className="mt-3 flex flex-col gap-3">
          {s.questions.map((q, i) => (
            <li key={q.id} className="animate-pop-in rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-center gap-2">
                <GripVertical size={16} className="shrink-0 text-slate-300" />
                <input className={`${inputCls} min-h-10`} value={q.label} onChange={(e) => setQ(i, { label: e.target.value })} aria-label="נוסח השאלה" />
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">{q.type === "number" ? "כמות" : q.type === "select" ? "בחירה" : "טקסט"}</span>
                <label className="flex shrink-0 items-center gap-1 text-xs text-slate-500"><input type="checkbox" checked={!!q.required} onChange={(e) => setQ(i, { required: e.target.checked })} className="accent-rose-500" />חובה</label>
                <button type="button" onClick={() => setS({ ...s, questions: s.questions.filter((_, j) => j !== i) })} aria-label="מחיקת שאלה" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>
              </div>
              {q.type === "number" && (
                <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Field label="מינימום"><input type="number" min="1" className={`${inputCls} min-h-10`} value={q.min} onChange={(e) => setQ(i, { min: e.target.value })} /></Field>
                  <Field label="מקסימום"><input type="number" min="1" className={`${inputCls} min-h-10`} value={q.max} onChange={(e) => setQ(i, { max: e.target.value })} /></Field>
                  <Field label="+ דקות ליחידה נוספת"><input type="number" min="0" className={`${inputCls} min-h-10`} value={q.extra_minutes} onChange={(e) => setQ(i, { extra_minutes: e.target.value })} /></Field>
                  <Field label="+ ₪ ליחידה נוספת"><input type="number" min="0" className={`${inputCls} min-h-10`} value={q.extra_price} onChange={(e) => setQ(i, { extra_price: e.target.value })} /></Field>
                </div>
              )}
              {q.type === "select" && (
                <div className="mt-2.5"><Field label="אפשרויות (מופרדות בפסיק)"><input className={`${inputCls} min-h-10`} value={q.options.join(", ")} onChange={(e) => setQ(i, { options: e.target.value.split(",") })} /></Field></div>
              )}
            </li>
          ))}
        </ul>
        {hasNum && (
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
            <span className="flex items-center gap-1.5"><Timer size={15} className="text-violet-500" />יחידה אחת: {minutesLabel(q1.minutes)} · {ils(q1.price)}</span>
            <span>3 יחידות: {minutesLabel(q3.minutes)} · {ils(q3.price)}</span>
          </p>
        )}
      </div>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-2">
        {service.id ? <Btn variant="danger" onClick={() => onDelete(service.id)}><Trash2 size={17} />מחיקת שירות</Btn> : <span />}
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={onClose}>ביטול</Btn>
          <Btn disabled={!s.name.trim()} onClick={() => onSave(clean())}><Check size={17} />שמירה</Btn>
        </div>
      </div>
    </Modal>
  );
}

function ServicesTab({ org, db, isAdmin, notify, fail, patchOrg }) {
  const [editing, setEditing] = useState(null);
  const blank = { name: "", description: "", duration_minutes: 60, price: 0, color: "rose", questions: [], is_active: true };

  const save = async (s) => {
    const row = { name: s.name, description: s.description || null, duration_minutes: s.duration_minutes, price: s.price, color: s.color, questions: s.questions, is_active: s.is_active };
    const { data, error } = s.id
      ? await db.from("services").update(row).eq("id", s.id).select().single()
      : await db.from("services").insert({ ...row, org_id: org.id, position: org.services.length }).select().single();
    if (error) return fail(error, "שמירת השירות נכשלה");
    patchOrg((o) => ({ ...o, services: s.id ? o.services.map((x) => (x.id === data.id ? data : x)) : [...o.services, data] }));
    setEditing(null);
    notify(s.id ? "השירות עודכן" : `השירות ${data.name} נוסף`);
  };
  const remove = async (id) => {
    const { error } = await db.from("services").delete().eq("id", id).select("id").single();
    if (error) return fail(error, "מחיקת השירות נכשלה");
    patchOrg((o) => ({ ...o, services: o.services.filter((x) => x.id !== id) }));
    setEditing(null);
    notify("השירות נמחק");
  };
  const addExamples = async () => {
    const rows = EXAMPLE_SERVICES.map((s, i) => ({ ...s, org_id: org.id, position: org.services.length + i }));
    const { data, error } = await db.from("services").insert(rows).select();
    if (error) return fail(error, "הוספת השירותים נכשלה");
    patchOrg((o) => ({ ...o, services: [...o.services, ...data] }));
    notify("נוספו שירותי דוגמה: ניקוי מזגן וניקוי ספות");
  };
  const toggle = async (s) => {
    const { data, error } = await db.from("services").update({ is_active: !s.is_active }).eq("id", s.id).select().single();
    if (error) return fail(error);
    patchOrg((o) => ({ ...o, services: o.services.map((x) => (x.id === data.id ? data : x)) }));
  };

  return (
    <div className="flex flex-col gap-5">
      {org.services.length === 0 && (
        <Card className="flex animate-fade-up flex-wrap items-center gap-4 bg-gradient-to-l from-rose-50 via-white to-violet-50 p-6">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm"><ListChecks size={26} className="text-rose-500" /></span>
          <div className="flex-1">
            <p className="text-lg font-semibold text-slate-800">עוד לא הגדרתם שירותים</p>
            <p className="text-sm text-slate-500">שירות הוא מה שהלקוח מזמין: משך, מחיר ושאלות המשך. אפשר להתחיל משירותי דוגמה ולערוך אותם.</p>
          </div>
          {isAdmin && <div className="flex flex-wrap gap-2"><Btn variant="ghost" onClick={addExamples}><Sparkles size={17} />שירותי דוגמה</Btn><Btn onClick={() => setEditing(blank)}><Plus size={17} />שירות חדש</Btn></div>}
        </Card>
      )}
      {org.services.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {org.services.map((s, i) => {
            const c = serviceColor(s.color);
            const count = org.appointments.filter((a) => a.service_id === s.id && a.status !== "cancelled").length;
            return (
              <Card key={s.id} className={`group relative animate-fade-up overflow-hidden p-5 transition duration-300 hover:-translate-y-1 hover:shadow-xl ${s.is_active ? "" : "opacity-60"}`} style={{ animationDelay: `${i * 50}ms` }}>
                <div aria-hidden className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-l ${c.grad}`} />
                <div className="flex items-start gap-3">
                  <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${c.grad} text-white shadow-md transition group-hover:-rotate-6 group-hover:scale-110`}><Sparkles size={22} /></span>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-bold text-slate-900">{s.name}</h3>
                    <p className="line-clamp-2 text-sm text-slate-500">{s.description || "ללא תיאור"}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-sm">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700"><Timer size={14} />{minutesLabel(s.duration_minutes)}</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700"><Coins size={14} />{ils(s.price)}</span>
                  {s.questions.length > 0 && <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium ${c.soft} ${c.text}`}><Wand2 size={14} />{s.questions.length} שאלות</span>}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-sm text-slate-500">
                  <span>{count} תורים</span>
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => toggle(s)} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${s.is_active ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>{s.is_active ? "פעיל" : "מוסתר"}</button>
                      <button onClick={() => setEditing(s)} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-100">עריכה</button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
          {isAdmin && (
            <button onClick={() => setEditing(blank)} className={`group flex min-h-48 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-rose-200 bg-white/60 text-[15px] font-semibold text-rose-500 transition hover:border-rose-300 hover:bg-white hover:text-rose-600 ${ICON_NUDGE}`}>
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50"><Plus size={24} /></span>שירות חדש
            </button>
          )}
        </div>
      )}
      {editing && <ServiceModal key={editing.id ?? "new"} service={editing} onClose={() => setEditing(null)} onSave={save} onDelete={remove} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Availability                                                       */
/* ------------------------------------------------------------------ */

export function AvailabilityTab({ org, db, isAdmin, notify, fail, patchOrg }) {
  const [week, setWeek] = useState(() => Array.from({ length: 7 }, (_, d) => org.rules.filter((r) => r.weekday === d).map((r) => ({ start: hhmm(r.start_time), end: hhmm(r.end_time) }))));
  const [b, setB] = useState(org.booking);
  const [block, setBlock] = useState({ starts_on: todayKey(), ends_on: todayKey(), reason: "" });
  const [busy, setBusy] = useState(false);
  const setDay = (d, ranges) => setWeek(week.map((r, i) => (i === d ? ranges : r)));
  const invalid = week.some((rs) => rs.some((r) => !r.start || !r.end || r.end <= r.start));

  const save = async () => {
    setBusy(true);
    const rows = week.flatMap((rs, weekday) => rs.map((r) => ({ org_id: org.id, weekday, start_time: r.start, end_time: r.end })));
    const del = await db.from("availability_rules").delete().eq("org_id", org.id);
    const ins = del.error ? del : rows.length ? await db.from("availability_rules").insert(rows) : { error: null };
    const upd = await db.from("organizations").update({
      booking_slot_minutes: Number(b.slotMinutes), booking_buffer_minutes: Number(b.bufferMinutes),
      booking_min_notice_hours: Number(b.minNoticeHours), booking_max_days: Number(b.maxDays),
    }).eq("id", org.id).select("id").single();
    setBusy(false);
    const error = del.error || ins.error || upd.error;
    if (error) return fail(error, "שמירת הזמינות נכשלה");
    patchOrg((o) => ({ ...o, rules: rows.map(({ weekday, start_time, end_time }) => ({ weekday, start_time: `${start_time}:00`, end_time: `${end_time}:00` })), booking: { ...o.booking, ...b } }));
    notify("שעות הזמינות נשמרו");
  };
  const addBlock = async () => {
    const { data, error } = await db.from("availability_blocks").insert({ ...block, reason: block.reason || null, org_id: org.id }).select().single();
    if (error) return fail(error, "חסימת התאריכים נכשלה");
    patchOrg((o) => ({ ...o, blocks: [...o.blocks, data].sort((x, y) => (x.starts_on < y.starts_on ? -1 : 1)) }));
    setBlock({ ...block, reason: "" });
    notify("התאריכים נחסמו להזמנות");
  };
  const removeBlock = async (id) => {
    const { error } = await db.from("availability_blocks").delete().eq("id", id).select("id").single();
    if (error) return fail(error);
    patchOrg((o) => ({ ...o, blocks: o.blocks.filter((x) => x.id !== id) }));
  };
  const sel = (k, opts, fmt) => (
    <select className={inputCls} value={b[k]} onChange={(e) => setB({ ...b, [k]: Number(e.target.value) })} disabled={!isAdmin}>
      {[...new Set([...opts, Number(b[k])])].sort((x, y) => x - y).map((v) => <option key={v} value={v}>{fmt(v)}</option>)}
    </select>
  );

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
      <Card className="animate-fade-up p-6">
        <SectionTitle icon={Clock}>שעות פעילות שבועיות</SectionTitle>
        <p className="mt-1 text-sm text-slate-500">הלקוחות יוכלו לקבוע תורים רק בטווחים האלה. אפשר כמה טווחים ביום (למשל הפסקת צהריים).</p>
        <ul className="mt-5 flex flex-col divide-y divide-slate-100">
          {week.map((ranges, d) => {
            const open = ranges.length > 0;
            return (
              <li key={d} className="flex flex-wrap items-start gap-3 py-3.5">
                <button type="button" role="switch" aria-checked={open} disabled={!isAdmin} onClick={() => setDay(d, open ? [] : [{ start: "08:00", end: d === 5 ? "13:00" : "18:00" }])}
                  className={`relative mt-2 h-7 w-12 shrink-0 rounded-full transition-colors duration-300 disabled:opacity-60 ${open ? "bg-gradient-to-l from-rose-500 to-pink-500" : "bg-slate-300"}`}>
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all duration-300 ${open ? "start-6" : "start-1"}`} />
                </button>
                <span className={`mt-2 w-16 shrink-0 text-[15px] font-semibold ${open ? "text-slate-800" : "text-slate-400"}`}>{WEEKDAYS_HE[d]}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {!open && <span className="mt-2 text-sm text-slate-400">סגור</span>}
                  {ranges.map((r, i) => (
                    <div key={i} className="flex animate-pop-in items-center gap-2">
                      <input type="time" step={900} className={`${inputCls} w-32`} value={r.start} disabled={!isAdmin} onChange={(e) => setDay(d, ranges.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} aria-label="משעה" />
                      <span className="text-slate-400">–</span>
                      <input type="time" step={900} className={`${inputCls} w-32 ${r.end <= r.start ? "border-red-300 ring-4 ring-red-50" : ""}`} value={r.end} disabled={!isAdmin} onChange={(e) => setDay(d, ranges.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} aria-label="עד שעה" />
                      {isAdmin && <button type="button" onClick={() => setDay(d, ranges.filter((_, j) => j !== i))} aria-label="הסרת טווח" className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"><X size={16} /></button>}
                    </div>
                  ))}
                </div>
                {open && isAdmin && (
                  <button type="button" onClick={() => setDay(d, [...ranges, { start: ranges.at(-1)?.end ?? "08:00", end: "20:00" }])} className="mt-1.5 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50"><Plus size={15} />טווח</button>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-4 grid grid-cols-1 gap-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2">
          <div className="flex items-center gap-2 text-base font-semibold text-slate-800 sm:col-span-2"><Settings2 size={18} className="text-violet-500" />כללי הזמנה</div>
          <Field label="מרווח בין תחילות תורים">{sel("slotMinutes", [15, 30, 45, 60], (v) => `כל ${minutesLabel(v)}`)}</Field>
          <Field label="זמן מעבר בין תורים">{sel("bufferMinutes", [0, 10, 15, 30, 45, 60], (v) => (v ? minutesLabel(v) : "ללא"))}</Field>
          <Field label="הזמנה מוקדמת לפחות">{sel("minNoticeHours", [0, 2, 4, 12, 24, 48], (v) => (v ? `${v} שעות מראש` : "אפשר גם לעכשיו"))}</Field>
          <Field label="אפשר להזמין עד">{sel("maxDays", [7, 14, 30, 60, 90], (v) => `${v} ימים קדימה`)}</Field>
        </div>
        {isAdmin && <div className="mt-6 flex justify-end"><Btn disabled={busy || invalid} onClick={save}><Check size={17} />שמירת זמינות</Btn></div>}
      </Card>

      <Card className="h-fit animate-fade-up p-6" style={{ animationDelay: "80ms" }}>
        <SectionTitle icon={CalendarX2} color="text-amber-500">ימים חסומים</SectionTitle>
        <p className="mt-1 text-sm text-slate-500">חגים, חופשה או מילואים. בימים האלה לא יוצגו שעות פנויות.</p>
        {isAdmin && (
          <div className="mt-4 flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2">
              <Field label="מתאריך"><input type="date" className={inputCls} value={block.starts_on} onChange={(e) => setBlock({ ...block, starts_on: e.target.value, ends_on: e.target.value > block.ends_on ? e.target.value : block.ends_on })} /></Field>
              <Field label="עד תאריך"><input type="date" className={inputCls} min={block.starts_on} value={block.ends_on} onChange={(e) => setBlock({ ...block, ends_on: e.target.value })} /></Field>
            </div>
            <Field label="סיבה (לא חובה)"><input className={inputCls} value={block.reason} onChange={(e) => setBlock({ ...block, reason: e.target.value })} placeholder="לדוגמה: סוכות" /></Field>
            <Btn variant="ghost" onClick={addBlock} disabled={block.ends_on < block.starts_on}><Ban size={17} />חסימת התאריכים</Btn>
          </div>
        )}
        <ul className="mt-4 flex flex-col gap-2">
          {org.blocks.length === 0 && <li className="text-sm text-slate-400">אין ימים חסומים.</li>}
          {org.blocks.map((x) => (
            <li key={x.id} className="flex animate-pop-in items-center gap-3 rounded-xl bg-amber-50/70 px-3 py-2.5">
              <Ban size={16} className="shrink-0 text-amber-600" />
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold text-slate-800">{x.starts_on === x.ends_on ? fmtDay(x.starts_on) : `${fmtDay(x.starts_on, { day: "numeric", month: "numeric" })} – ${fmtDay(x.ends_on, { day: "numeric", month: "numeric" })}`}</span>
                {x.reason && <span className="block text-xs text-slate-500">{x.reason}</span>}
              </span>
              {isAdmin && <button onClick={() => removeBlock(x.id)} aria-label="ביטול חסימה" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-white hover:text-red-600"><X size={16} /></button>}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Booking page link + Google Calendar                                */
/* ------------------------------------------------------------------ */

function BookingPageTab({ org, db, isAdmin, notify, fail, patchOrg, siteUrl, providers }) {
  const url = `${siteUrl.replace(/\/$/, "")}/book/${org.slug}`;
  const [headline, setHeadline] = useState(org.booking.headline);
  const copy = async () => { try { await navigator.clipboard.writeText(url); notify("הקישור הועתק"); } catch { notify("לא ניתן להעתיק, סמנו את הקישור ידנית", "error"); } };
  const update = async (patch, ui) => {
    const { error } = await db.from("organizations").update(patch).eq("id", org.id).select("id").single();
    if (error) return fail(error, "השמירה נכשלה");
    patchOrg((o) => ({ ...o, booking: { ...o.booking, ...ui } }));
    notify("נשמר");
  };
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <Card className="relative animate-fade-up overflow-hidden p-6">
        <div aria-hidden className="absolute -end-16 -top-16 h-48 w-48 rounded-full bg-gradient-to-br from-rose-400 to-violet-400 opacity-10" />
        <SectionTitle icon={Link2}>דף הזמנת תורים ציבורי</SectionTitle>
        <p className="mt-1 text-sm text-slate-500">שתפו בוואטסאפ, באינסטגרם או באתר. הלקוח בוחר שירות, עונה על שאלות, בוחר שעה פנויה ומקבל אישור.</p>
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 ps-4">
          <span dir="ltr" className="min-w-0 flex-1 truncate text-start text-[15px] font-medium text-slate-700">{url}</span>
          <button onClick={copy} aria-label="העתקת קישור" className="rounded-xl bg-white p-2.5 text-slate-500 shadow-sm transition hover:text-rose-600 active:scale-90"><Copy size={17} /></button>
          <a href={`/book/${org.slug}`} target="_blank" rel="noreferrer" aria-label="פתיחת הדף" className="rounded-xl bg-gradient-to-l from-rose-500 to-pink-500 p-2.5 text-white shadow-md transition hover:-translate-y-0.5 active:scale-90"><ExternalLink size={17} /></a>
        </div>
        <div className="mt-4 flex flex-col gap-3">
          <Toggle checked={org.booking.enabled} disabled={!isAdmin} onChange={(v) => update({ booking_enabled: v }, { enabled: v })}
            icon={Globe} title="הדף פתוח להזמנות" text={org.booking.enabled ? "לקוחות יכולים לקבוע תורים עכשיו" : "הדף מוסתר, הקישור מחזיר ״לא נמצא״"} />
          <Field label="כותרת משנה בדף">
            <div className="flex gap-2">
              <input className={inputCls} value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder="לדוגמה: ניקוי מקצועי עד הבית, בלי לכלוך" disabled={!isAdmin} maxLength={160} />
              {isAdmin && headline !== org.booking.headline && <Btn variant="ghost" onClick={() => update({ booking_headline: headline || null }, { headline })}><Check size={17} /></Btn>}
            </div>
          </Field>
        </div>
        <ol className="mt-5 grid grid-cols-5 gap-1.5 text-center text-xs font-medium text-slate-500">
          {["שירות", "שאלות", "מועד", "פרטים", "אישור"].map((s, i) => (
            <li key={s} className="flex flex-col items-center gap-1">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-50 text-sm font-bold text-rose-600">{i + 1}</span>{s}
            </li>
          ))}
        </ol>
        {org.services.filter((s) => s.is_active).length === 0 && <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700">אין שירותים פעילים, הדף עדיין ריק. הוסיפו שירות בלשונית ״שירותים״.</p>}
      </Card>

      <GoogleCalendarCard org={org} db={db} isAdmin={isAdmin} notify={notify} fail={fail} patchOrg={patchOrg} providers={providers} delay={80} />
    </div>
  );
}

const GOOGLE_STATUS = {
  active: { label: "מחובר ומסונכרן", cls: "bg-emerald-50 text-emerald-700" },
  pending: { label: "ממתין לאישור", cls: "bg-amber-50 text-amber-700" },
  error: { label: "החיבור נכשל, צריך לחבר מחדש", cls: "bg-red-50 text-red-600" },
  revoked: { label: "ההרשאה בוטלה", cls: "bg-slate-100 text-slate-500" },
};

export function GoogleCalendarCard({ org, db, isAdmin, notify, fail, patchOrg, providers, delay = 0 }) {
  const google = org.calendars.find((c) => c.provider === "google");
  const [busy, setBusy] = useState(false);
  const pending = org.appointments.filter((a) => a.sync_status === "pending").length;
  const synced = org.appointments.filter((a) => a.sync_status === "synced").length;
  const disconnect = async () => {
    setBusy(true);
    const { error } = await db.from("calendar_connections").delete().eq("id", google.id).select("id").single();
    setBusy(false);
    if (error) return fail(error, "ניתוק היומן נכשל");
    patchOrg((o) => ({ ...o, calendars: o.calendars.filter((c) => c.id !== google.id) }));
    notify("יומן Google נותק");
  };
  const syncNow = async () => {
    setBusy(true);
    const res = await fetch("/api/calendar/google/sync", { method: "POST" }).then((r) => r.json()).catch(() => null);
    setBusy(false);
    notify(res && !res.error ? `סונכרנו ${res.synced ?? 0} תורים ליומן Google` : "הסנכרון נכשל", res && !res.error ? "ok" : "error");
  };
  const st = google ? GOOGLE_STATUS[google.status] ?? GOOGLE_STATUS.pending : null;

  return (
    <Card className="animate-fade-up p-6" style={{ animationDelay: `${delay}ms` }}>
      <SectionTitle icon={CalendarDays} color="text-sky-500">סנכרון Google Calendar</SectionTitle>
      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 p-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden><rect x="3" y="4" width="18" height="17" rx="3" fill="#fff" stroke="#4285F4" strokeWidth="2" /><rect x="3" y="4" width="18" height="5" rx="2" fill="#4285F4" /><text x="12" y="18.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#34A853">31</text></svg>
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-slate-800" dir="auto" style={{ textAlign: "start" }}>{google ? google.account_email || google.calendar_id : "לא מחובר"}</div>
          {st ? <span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span>
            : <div className="text-sm text-slate-500">{providers.google ? "מוכן לחיבור בלחיצה" : "ממתין להגדרת OAuth ב-Google Cloud"}</div>}
        </div>
        {isAdmin && !google && (
          providers.google
            ? <a href={`/api/calendar/google/connect?org=${org.id}`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-l from-sky-500 to-indigo-500 px-5 text-[15px] font-semibold text-white shadow-lg shadow-sky-500/25 transition hover:-translate-y-0.5"><RefreshCw size={17} />חיבור Google</a>
            : <Btn variant="ghost" disabled title="צריך להגדיר GOOGLE_CLIENT_ID ו-GOOGLE_CLIENT_SECRET"><RefreshCw size={17} />חיבור</Btn>
        )}
        {isAdmin && google && (
          <div className="flex gap-2">
            {google.status === "error" && <a href={`/api/calendar/google/connect?org=${org.id}`} className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-l from-sky-500 to-indigo-500 px-4 text-sm font-semibold text-white shadow-md">חיבור מחדש</a>}
            {google.status === "active" && <Btn variant="ghost" onClick={syncNow} disabled={busy} className="h-11 px-4 text-sm"><RefreshCw size={16} className={busy ? "animate-spin" : ""} />סנכרון</Btn>}
            <Btn variant="danger" onClick={disconnect} disabled={busy} className="h-11 px-4 text-sm"><X size={16} />ניתוק</Btn>
          </div>
        )}
      </div>
      {google?.status === "active" && (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700 tabular-nums">{synced} תורים ביומן</span>
          {pending > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700 tabular-nums">{pending} ממתינים לסנכרון</span>}
          {google.last_synced_at && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">סונכרן לאחרונה {fmtDate(google.last_synced_at, { day: "numeric", month: "numeric" })} {fmtTime(google.last_synced_at)}</span>}
        </div>
      )}
      {google?.last_error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{google.last_error}</p>}
      <ul className="mt-4 flex flex-col gap-2.5 text-sm text-slate-600">
        <li className="flex gap-2"><ArrowLeft size={16} className="mt-0.5 shrink-0 text-sky-500" />כל תור חדש, שינוי או ביטול (מהדף, מהבוט או ידני) נרשם ביומן Google שלכם.</li>
        <li className="flex gap-2"><ArrowLeft size={16} className="mt-0.5 shrink-0 text-sky-500" />שעות תפוסות ביומן Google לא יוצעו ללקוחות בבוט ובדף ההזמנה.</li>
        <li className="flex gap-2"><ArrowLeft size={16} className="mt-0.5 shrink-0 text-sky-500" />אם החיבור נופל, התורים נשמרים במערכת ומסונכרנים שוב בריצה היומית.</li>
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

export default function CalendarPage(props) {
  const { org, canEdit } = props;
  const [tab, setTab] = useState("week");
  const [appt, setAppt] = useState(null);
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs tab={tab} setTab={setTab} />
        {org.booking.enabled && (
          <a href={`/book/${org.slug}`} target="_blank" rel="noreferrer" className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-rose-600 shadow-sm ring-1 ring-rose-100 transition hover:-translate-y-0.5 hover:shadow-md">
            <ExternalLink size={15} />לדף ההזמנה
          </a>
        )}
      </div>
      <div key={tab} className="animate-fade-up">
        {tab === "week" && <WeekView org={org} canEdit={canEdit} onOpen={setAppt} onNew={(day, time) => setAppt({ day, time })} />}
        {tab === "services" && <ServicesTab {...props} />}
        {tab === "availability" && <AvailabilityTab key={org.id} {...props} />}
        {tab === "page" && <BookingPageTab key={org.id} {...props} />}
      </div>
      {appt && <AppointmentModal key={appt.id ?? "new"} appt={appt} {...props} onClose={() => setAppt(null)} />}
    </div>
  );
}
