"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Card, Avatar, ICON_NUDGE, Btn, Field, inputCls, RoleBadge, SectionTitle, Modal, Toggle } from "@/components/ui";
import CalendarPage from "@/components/booking/CalendarPage";
import AutomationsPage from "@/components/booking/AutomationsPage";
import BotAdminPage from "@/components/bot/BotAdminPage";
import { localParts, fmtTime, todayKey, WEEKDAYS_SHORT, serviceColor } from "@/lib/booking/shared";
import {
  LayoutDashboard, SquareKanban, ChartColumn, Users, Settings, ChevronsUpDown, Plus, Check,
  Search, Bell, X, Mail, ShieldCheck, UserPlus, TrendingUp, TrendingDown, Wallet, Target,
  Clock, Tag, Phone, Building2, Cookie, Accessibility, Trash2, Calendar, Sparkles, LogOut,
  Menu, Activity, Type, Contrast, GripVertical, Send, Globe, Percent, Heart, ArrowLeft,
  Cake, BellRing, Wrench, CalendarCheck, CalendarDays, Zap, Bot,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Pulse CRM · Nitzanet                                               */
/*  Multi-tenant SaaS CRM dashboard backed by Supabase. Each org       */
/*  (tenant) owns its own leads + members; RLS enforces access.        */
/* ------------------------------------------------------------------ */

const STAGES = [
  { id: "new", label: "לידים חדשים", dot: "bg-sky-500", soft: "bg-sky-50", text: "text-sky-700", edge: "border-s-sky-400" },
  { id: "in_progress", label: "בטיפול", dot: "bg-amber-500", soft: "bg-amber-50", text: "text-amber-700", edge: "border-s-amber-400" },
  { id: "proposal", label: "הצעת מחיר", dot: "bg-violet-500", soft: "bg-violet-50", text: "text-violet-700", edge: "border-s-violet-400" },
  { id: "won", label: "עסקה נסגרה", dot: "bg-emerald-500", soft: "bg-emerald-50", text: "text-emerald-700", edge: "border-s-emerald-400" },
  { id: "lost", label: "הפסד", dot: "bg-slate-400", soft: "bg-slate-100", text: "text-slate-600", edge: "border-s-slate-300" },
];
const isOpen = (l) => l.stage !== "won" && l.stage !== "lost";

const TAG_STYLES = {
  "חם": "bg-rose-50 text-rose-700 border-rose-200",
  "VIP": "bg-amber-50 text-amber-700 border-amber-200",
  "אתר": "bg-sky-50 text-sky-700 border-sky-200",
  "SEO": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "קמפיין": "bg-violet-50 text-violet-700 border-violet-200",
  "ריטיינר": "bg-indigo-50 text-indigo-700 border-indigo-200",
  "הפניה": "bg-teal-50 text-teal-700 border-teal-200",
};
const tagClass = (t) => TAG_STYLES[t] || "bg-slate-50 text-slate-600 border-slate-200";


const ils = (n) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
const today = () => new Date().toISOString().slice(0, 10);
const HE_MONTHS = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];
const ROLE_TO_DB = { Admin: "admin", Agent: "agent", Viewer: "viewer" };
const slugify = (name) => {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return `${base.length >= 2 ? base : "org"}-${Math.random().toString(36).slice(2, 7)}`;
};

// Date helpers for birthdays and recurring service (dates are "YYYY-MM-DD")
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const startOfToday = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
const fmtDay = (d) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
const daysBetween = (a, b) => Math.round((b - a) / 86400000);
const nextService = (l) => {
  if (!l.serviceMonths || !l.lastService) return null;
  const d = parseDay(l.lastService);
  d.setMonth(d.getMonth() + Number(l.serviceMonths));
  return d;
};
const daysToBirthday = (l) => {
  if (!l.birthday) return null;
  const t = startOfToday();
  const b = parseDay(l.birthday);
  let next = new Date(t.getFullYear(), b.getMonth(), b.getDate());
  if (next < t) next = new Date(t.getFullYear() + 1, b.getMonth(), b.getDate());
  return daysBetween(t, next);
};
const SERVICE_OPTIONS = [
  { v: "", label: "ללא שירות חוזר" },
  { v: 3, label: "כל 3 חודשים" },
  { v: 6, label: "כל חצי שנה" },
  { v: 12, label: "כל שנה" },
  { v: 24, label: "כל שנתיים" },
];

// Upcoming birthdays and services for the next `days` days (overdue services included)
const upcomingReminders = (leads, days = 30) => {
  const t = startOfToday();
  const items = [];
  for (const l of leads) {
    const bd = daysToBirthday(l);
    if (bd != null && bd <= days) items.push({ kind: "birthday", lead: l, days: bd });
    const ns = nextService(l);
    if (ns && l.stage !== "lost") { const d = daysBetween(t, ns); if (d <= days) items.push({ kind: "service", lead: l, days: d, date: ns }); }
  }
  return items.sort((a, b) => a.days - b.days);
};

// Lead (UI shape) -> leads row
const toRow = (l) => ({
  title: l.name.trim(),
  contact_name: l.contact || null,
  phone: l.phone || null,
  email: l.email || null,
  value: Number(l.value) || 0,
  stage: l.stage,
  assignee_id: l.owner || null,
  tags: l.tags,
  source: l.source || null,
  notes: l.note || null,
  birthday: l.birthday || null,
  service_interval_months: l.serviceMonths ? Number(l.serviceMonths) : null,
  last_service_at: l.lastService || null,
});

/* --------------------------- organization switcher --------------------------- */

function OrgSwitcher({ orgs, current, onSwitch, onCreate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 text-start shadow-sm transition hover:border-rose-200 hover:shadow-md">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${current.color} text-base font-bold text-white shadow-sm`}>{current.name[0]}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-slate-800">{current.name}</span>
          <span className="block text-xs text-slate-500">תוכנית {current.plan} · {current.members.length} חברים</span>
        </span>
        <ChevronsUpDown size={18} className="text-slate-400" />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-40 mt-2 animate-pop-in overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-900/10">
          <p className="px-3 pb-1 pt-2 text-xs font-semibold text-slate-400">הארגונים שלך</p>
          {orgs.map((o) => (
            <button key={o.id} onClick={() => { onSwitch(o.id); setOpen(false); }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[15px] text-slate-700 transition hover:bg-rose-50">
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br ${o.color} text-xs font-bold text-white`}>{o.name[0]}</span>
              <span className="flex-1 truncate text-start">{o.name}</span>
              {o.id === current.id && <Check size={17} className="text-rose-500" />}
            </button>
          ))}
          <div className="my-1 h-px bg-slate-100" />
          <button onClick={() => { onCreate(); setOpen(false); }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-[15px] font-medium text-rose-600 transition hover:bg-rose-50">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-dashed border-rose-300"><Plus size={15} /></span>
            הוספת עסק חדש
          </button>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------- KPIs ----------------------------------- */

// Eases a number up to its target so totals feel alive when a page opens.
function useCountUp(target, ms = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let raf;
    const tick = (t) => {
      const p = reduce ? 1 : Math.min(1, (t - start) / ms);
      setV(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

// Soft light that follows the pointer across a card.
const spotlight = (e) => {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
};
const SPOT = "pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100 bg-[radial-gradient(260px_circle_at_var(--mx)_var(--my),rgba(244,63,94,0.10),transparent_70%)]";

function KpiCard({ icon: Icon, label, value, format = (n) => n, delta, hint, tone, delay = 0 }) {
  const up = delta == null || delta >= 0;
  const shown = useCountUp(value);
  return (
    <Card onMouseMove={spotlight} className="group relative animate-fade-up overflow-hidden p-5 transition duration-300 hover:-translate-y-1 hover:shadow-xl" style={{ animationDelay: `${delay}ms` }}>
      <div aria-hidden className={SPOT} />
      <div aria-hidden className={`absolute -end-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-br ${tone} opacity-10 transition duration-500 group-hover:scale-125 group-hover:opacity-20`} />
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${tone} text-white shadow-md transition duration-300 group-hover:-rotate-6 group-hover:scale-110`}>
          <Icon size={21} />
        </span>
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{format(Math.round(shown))}</div>
      <div className="mt-1.5 flex items-center gap-2">
        {delta != null && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${up ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
            {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}{Math.abs(delta)}%
          </span>
        )}
        <span className="text-sm text-slate-500">{hint}</span>
      </div>
    </Card>
  );
}

function Kpis({ leads }) {
  const won = leads.filter((l) => l.stage === "won");
  const open = leads.filter(isOpen);
  const wonValue = won.reduce((s, l) => s + l.value, 0);
  const pipeline = open.reduce((s, l) => s + l.value, 0);
  const conv = leads.length ? Math.round((won.length / leads.length) * 100) : 0;
  const avg = won.length ? Math.round(wonValue / won.length) : 0;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard icon={Wallet} tone="from-emerald-400 to-teal-500" label="הכנסות שנסגרו" value={wonValue} format={ils} hint={`${won.length} עסקאות`} delay={0} />
      <KpiCard icon={Activity} tone="from-rose-400 to-pink-500" label="שווי צנרת פתוחה" value={pipeline} format={ils} hint={`${open.length} לידים פעילים`} delay={70} />
      <KpiCard icon={Percent} tone="from-violet-400 to-indigo-500" label="יחס המרה" value={conv} format={(n) => `${n}%`} hint="ליד לעסקה סגורה" delay={140} />
      <KpiCard icon={Target} tone="from-amber-400 to-orange-500" label="עסקה ממוצעת" value={avg} format={ils} hint="בעסקאות שנסגרו" delay={210} />
    </div>
  );
}

/* ---------------------------------- kanban ---------------------------------- */

function ReminderBadges({ lead }) {
  const bd = daysToBirthday(lead);
  const ns = nextService(lead);
  const sd = ns ? daysBetween(startOfToday(), ns) : null;
  const showBd = bd != null && bd <= 7;
  const showSd = sd != null && sd <= 14 && lead.stage !== "lost";
  if (!showBd && !showSd) return null;
  return (
    <div className="mt-2.5 flex flex-wrap gap-1.5">
      {showBd && (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${bd === 0 ? "bg-gradient-to-l from-rose-500 to-pink-500 text-white" : "bg-pink-50 text-pink-700"}`}>
          <Cake size={13} className={bd === 0 ? "animate-wiggle" : ""} />{bd === 0 ? "יום הולדת היום!" : `יום הולדת בעוד ${bd} ימים`}
        </span>
      )}
      {showSd && (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${sd < 0 ? "bg-red-50 text-red-700" : "bg-sky-50 text-sky-700"}`}>
          <BellRing size={13} />{sd < 0 ? `שירות באיחור (${-sd} ימים)` : sd === 0 ? "שירות היום" : `שירות בעוד ${sd} ימים`}
        </span>
      )}
    </div>
  );
}

function LeadCard({ lead, owner, onOpen, onDragStart, dragging, draggable = true }) {
  const stage = STAGES.find((s) => s.id === lead.stage);
  return (
    <div draggable={draggable} onDragStart={(e) => onDragStart(e, lead.id)} onClick={() => onOpen(lead)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(lead)} tabIndex={0} role="button" aria-label={`ליד: ${lead.name}`}
      className={`group animate-pop-in cursor-grab rounded-xl border border-s-4 border-slate-200 ${stage.edge} bg-white p-3.5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-200 active:scale-[0.98] active:cursor-grabbing ${dragging ? "rotate-2 opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-[15px] font-semibold leading-snug text-slate-900">{lead.name}</h4>
        <GripVertical size={16} className="mt-0.5 shrink-0 text-slate-300 opacity-0 transition group-hover:opacity-100" />
      </div>
      {lead.contact && <p className="mt-0.5 text-sm text-slate-500">{lead.contact}</p>}
      {lead.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {lead.tags.map((t) => <span key={t} className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tagClass(t)}`}>{t}</span>)}
        </div>
      )}
      <ReminderBadges lead={lead} />
      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-base font-bold tabular-nums text-slate-900">{ils(lead.value)}</span>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-slate-500"><Calendar size={13} />{lead.created.slice(5).split("-").reverse().join("/")}</span>
          <Avatar member={owner} size="h-7 w-7 text-[11px]" />
        </div>
      </div>
    </div>
  );
}

function Kanban({ org, onMove, onOpen, onAdd, query, canEdit }) {
  const [dragId, setDragId] = useState(null);
  const [over, setOver] = useState(null);
  const memberById = (id) => org.members.find((m) => m.id === id);
  const leads = org.leads.filter((l) => !query || `${l.name} ${l.contact} ${l.tags.join(" ")}`.includes(query));
  const start = (e, id) => { setDragId(id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", id); };
  return (
    <div className="flex flex-col gap-4">
    {org.leads.length === 0 && canEdit && (
      <Card className="flex animate-fade-up flex-wrap items-center gap-4 bg-gradient-to-l from-rose-50 via-white to-violet-50 p-5">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100"><Heart size={24} className="animate-heartbeat fill-rose-500 text-rose-500" /></span>
        <div className="flex-1">
          <p className="text-base font-semibold text-slate-800">הלוח מחכה לליד הראשון שלכם</p>
          <p className="text-sm text-slate-500">אחרי שתוסיפו לידים, פשוט גוררים אותם בין העמודות. כשעסקה נסגרת, יש חגיגה קטנה.</p>
        </div>
        <Btn onClick={onAdd}><Plus size={18} />ליד חדש</Btn>
      </Card>
    )}
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="grid min-w-[1080px] grid-cols-5 gap-3">
        {STAGES.map((s) => {
          const items = leads.filter((l) => l.stage === s.id);
          const total = items.reduce((a, l) => a + l.value, 0);
          return (
            <section key={s.id} aria-label={s.label}
              onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
              onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain") || dragId; if (id) onMove(id, s.id); setDragId(null); setOver(null); }}
              className={`flex min-h-[460px] flex-col rounded-2xl border-2 transition duration-200 ${over === s.id ? `scale-[1.01] border-dashed border-rose-300 ${s.soft}` : "border-transparent bg-slate-100/70"}`}>
              <header className="px-3.5 py-3.5">
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.dot} ${over === s.id ? "animate-heartbeat" : ""}`} />
                  <h3 className="text-[15px] font-bold text-slate-800">{s.label}</h3>
                  <span className={`ms-auto rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${s.soft} ${s.text}`}>{items.length}</span>
                </div>
                <div className="mt-0.5 ps-[18px] text-sm font-semibold text-slate-500 tabular-nums">{ils(total)}</div>
              </header>
              <div className="flex flex-1 flex-col gap-2.5 px-2.5 pb-2.5" onDragEnd={() => { setDragId(null); setOver(null); }}>
                {items.map((l) => <LeadCard key={l.id} lead={l} owner={memberById(l.owner)} onOpen={onOpen} onDragStart={start} dragging={dragId === l.id} draggable={canEdit} />)}
                {items.length === 0 && <div className="flex flex-1 items-center justify-center rounded-xl border-2 border-dashed border-slate-200 py-10 text-sm text-slate-400">גררו ליד לכאן</div>}
                {s.id === "new" && canEdit && (
                  <button onClick={onAdd} className={`group flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-rose-200 bg-white/60 text-sm font-semibold text-rose-500 transition hover:border-rose-300 hover:bg-white hover:text-rose-600 ${ICON_NUDGE}`}>
                    <Plus size={17} /> ליד חדש
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
    </div>
  );
}

/* --------------------------------- lead modal -------------------------------- */

function LeadModal({ lead, org, onClose, onSave, onDelete, canEdit, canDelete }) {
  const [draft, setDraft] = useState(lead);
  if (!lead || !draft) return null;
  const isNew = !org.leads.some((l) => l.id === lead.id);
  const set = (k) => (e) => setDraft({ ...draft, [k]: k === "value" ? Number(e.target.value) || 0 : k === "serviceMonths" ? (Number(e.target.value) || null) : e.target.value });
  const ns = nextService(draft);
  const bd = daysToBirthday(draft);
  const toggleTag = (t) => setDraft({ ...draft, tags: draft.tags.includes(t) ? draft.tags.filter((x) => x !== t) : [...draft.tags, t] });
  const owner = org.members.find((m) => m.id === draft.owner);
  return (
    <Modal open onClose={onClose} title={isNew ? "ליד חדש" : "פרטי ליד"} wide>
      {!isNew && (
        <div className="mb-6 flex flex-wrap items-center gap-4 rounded-2xl bg-gradient-to-l from-rose-50 to-violet-50 p-4">
          <Avatar member={owner} size="h-12 w-12 text-base" />
          <div className="min-w-0 flex-1">
            <div className="text-xl font-bold text-slate-900">{draft.name}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
              {draft.phone && <span className="flex items-center gap-1"><Phone size={14} /><span dir="ltr">{draft.phone}</span></span>}
              {draft.email && <span className="flex items-center gap-1"><Mail size={14} /><span dir="ltr">{draft.email}</span></span>}
              {draft.source && <span className="flex items-center gap-1"><Globe size={14} />{draft.source}</span>}
            </div>
          </div>
          <div className="text-start">
            <div className="text-xs font-medium text-slate-500">שווי עסקה</div>
            <div className="text-2xl font-bold tabular-nums text-slate-900">{ils(draft.value)}</div>
          </div>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="שם העסק"><input id="lead-name" className={inputCls} value={draft.name} onChange={set("name")} placeholder="לדוגמה: קפה ארומה" /></Field>
        <Field label="איש קשר"><input id="lead-contact" className={inputCls} value={draft.contact} onChange={set("contact")} /></Field>
        <Field label="טלפון"><input id="lead-phone" dir="ltr" className={inputCls} value={draft.phone} onChange={set("phone")} /></Field>
        <Field label="אימייל"><input id="lead-email" dir="ltr" className={inputCls} value={draft.email} onChange={set("email")} /></Field>
        <Field label="סכום עסקה (₪)"><input id="lead-value" type="number" min="0" className={inputCls} value={draft.value} onChange={set("value")} /></Field>
        <Field label="שלב">
          <select id="lead-stage" className={inputCls} value={draft.stage} onChange={set("stage")}>
            {STAGES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </Field>
        <Field label="שיוך לאיש צוות">
          <select id="lead-owner" className={inputCls} value={draft.owner ?? ""} onChange={set("owner")}>
            <option value="">ללא שיוך</option>
            {org.members.filter((m) => m.status === "active").map((m) => <option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}
          </select>
        </Field>
        <Field label="מקור">
          <input id="lead-source" className={inputCls} value={draft.source} onChange={set("source")} />
        </Field>
      </div>
      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex items-center gap-2 text-base font-semibold text-slate-800"><CalendarCheck size={18} className="text-violet-500" />תאריכים ושירות חוזר</div>
        <p className="mt-0.5 text-sm text-slate-500">המערכת תשלח ללקוח ברכה ביום ההולדת ותזכורת שבוע לפני מועד השירות הבא (לפי כתובת המייל שלו).</p>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="תאריך לידה"><input id="lead-birthday" type="date" className={inputCls} value={draft.birthday ?? ""} onChange={set("birthday")} /></Field>
          <Field label="שירות חוזר">
            <select id="lead-service" className={inputCls} value={draft.serviceMonths ?? ""} onChange={set("serviceMonths")}>
              {SERVICE_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="שירות אחרון">
            <div className="flex gap-1.5">
              <input id="lead-last-service" type="date" className={inputCls} value={draft.lastService ?? ""} onChange={set("lastService")} />
              <button type="button" title="השירות בוצע היום" onClick={() => setDraft({ ...draft, lastService: today() })}
                className="shrink-0 rounded-xl border border-slate-200 bg-white px-2.5 text-slate-500 shadow-sm transition hover:border-emerald-300 hover:text-emerald-600 active:scale-95"><Wrench size={17} /></button>
            </div>
          </Field>
        </div>
        {(ns || bd != null) && (
          <div className="mt-3 flex flex-wrap gap-2 text-sm">
            {bd != null && <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-50 px-3 py-1 font-medium text-pink-700"><Cake size={15} />{bd === 0 ? "יום ההולדת היום!" : `יום הולדת בעוד ${bd} ימים`}</span>}
            {ns && <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 font-medium text-sky-700"><BellRing size={15} />השירות הבא: {fmtDay(ns)}</span>}
            {!draft.email && <span className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 font-medium text-amber-700">חסר מייל ללקוח, לא יישלחו הודעות</span>}
          </div>
        )}
      </div>
      <div className="mt-5">
        <span className="text-sm font-medium text-slate-600">תגיות</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {Object.keys(TAG_STYLES).map((t) => (
            <button key={t} type="button" onClick={() => toggleTag(t)} aria-pressed={draft.tags.includes(t)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition duration-200 active:scale-95 ${draft.tags.includes(t) ? `${tagClass(t)} shadow-sm` : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700"}`}>
              <Tag size={12} className="me-1 inline" />{t}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-5">
        <Field label="הערות"><textarea id="lead-note" rows={3} className={inputCls} value={draft.note} onChange={set("note")} placeholder="סיכום שיחה, צעדים הבאים..." /></Field>
      </div>
      <div className="mt-7 flex flex-wrap items-center justify-between gap-2">
        {!isNew && canDelete ? <Btn variant="danger" onClick={() => onDelete(lead.id)}><Trash2 size={17} />מחיקת ליד</Btn> : <span />}
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={onClose}>{canEdit ? "ביטול" : "סגירה"}</Btn>
          {canEdit && <Btn disabled={!draft.name.trim()} onClick={() => onSave(draft)}><Check size={17} />{isNew ? "יצירת ליד" : "שמירת שינויים"}</Btn>}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------- dashboard --------------------------------- */

function Welcome({ name, onAdd, go }) {
  return (
    <Card className="relative animate-fade-up overflow-hidden border-0 bg-gradient-to-l from-rose-500 via-pink-500 to-violet-500 p-6 text-white sm:p-8">
      <div aria-hidden className="absolute -start-10 -top-16 h-52 w-52 rounded-full bg-white/10" />
      <div aria-hidden className="absolute -bottom-20 end-10 h-56 w-56 rounded-full bg-white/10" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
          <Heart size={34} className="animate-heartbeat fill-white" />
        </span>
        <div className="flex-1">
          <h2 className="text-2xl font-bold sm:text-3xl">ברוכים הבאים ל-{name}!</h2>
          <p className="mt-1 max-w-xl text-base text-white/90">הלוח עדיין ריק. הוסיפו את הליד הראשון, ומשם תוכלו לגרור אותו בין השלבים עד לסגירת העסקה.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onAdd && (
            <button onClick={onAdd} className={`inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-base font-bold text-rose-600 shadow-lg transition duration-200 hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.97] ${ICON_NUDGE}`}>
              <Plus size={19} />הוספת ליד ראשון
            </button>
          )}
          <button onClick={() => go("team")} className={`inline-flex h-12 items-center gap-2 rounded-xl bg-white/15 px-5 text-base font-semibold text-white ring-1 ring-white/40 transition duration-200 hover:-translate-y-0.5 hover:bg-white/25 active:scale-[0.97] ${ICON_NUDGE}`}>
            <UserPlus size={19} />הזמנת הצוות
          </button>
        </div>
      </div>
    </Card>
  );
}

function Reminders({ leads, onOpen }) {
  const items = upcomingReminders(leads).slice(0, 6);
  return (
    <Card className="animate-fade-up p-6" style={{ animationDelay: "150ms" }}>
      <SectionTitle icon={BellRing} color="text-sky-500">תזכורות קרובות</SectionTitle>
      {items.length === 0 && <p className="mt-3 text-sm text-slate-500">אין ימי הולדת או שירותים ב-30 הימים הקרובים. אפשר להוסיף תאריך לידה ושירות חוזר בכרטיס הלקוח.</p>}
      <ul className="mt-3 flex flex-col gap-1.5">
        {items.map((it) => (
          <li key={`${it.kind}-${it.lead.id}`}>
            <button onClick={() => onOpen(it.lead)} className="flex w-full items-center gap-3 rounded-xl p-1.5 text-start transition hover:bg-slate-50">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${it.kind === "birthday" ? "bg-pink-50 text-pink-600" : it.days < 0 ? "bg-red-50 text-red-600" : "bg-sky-50 text-sky-600"}`}>
                {it.kind === "birthday" ? <Cake size={17} className={it.days === 0 ? "animate-wiggle" : ""} /> : <Wrench size={16} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-slate-800">{it.lead.contact || it.lead.name}</span>
                <span className="block text-xs text-slate-500">
                  {it.kind === "birthday"
                    ? (it.days === 0 ? "יום הולדת היום! ברכה נשלחת אוטומטית" : `יום הולדת בעוד ${it.days} ימים`)
                    : (it.days < 0 ? `שירות באיחור של ${-it.days} ימים` : it.days === 0 ? "שירות מתוכנן להיום" : `שירות בעוד ${it.days} ימים · ${fmtDay(it.date)}`)}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function UpcomingAppointments({ org, go }) {
  const [now] = useState(() => Date.now());
  const items = org.appointments.filter((a) => (a.status === "confirmed" || a.status === "pending") && new Date(a.ends_at).getTime() > now).slice(0, 4);
  const svc = (id) => org.services.find((s) => s.id === id);
  const today = todayKey();
  return (
    <Card className="animate-fade-up p-6" style={{ animationDelay: "130ms" }}>
      <SectionTitle icon={CalendarDays} color="text-rose-500" action={
        <button onClick={() => go("calendar")} className="group inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-100">
          ליומן <ArrowLeft size={15} className="transition group-hover:-translate-x-1" />
        </button>
      }>תורים קרובים</SectionTitle>
      {items.length === 0 && <p className="mt-3 text-sm text-slate-500">אין תורים קרובים. שתפו את דף ההזמנה מלשונית ״יומן ותורים״.</p>}
      <ul className="mt-3 flex flex-col gap-1.5">
        {items.map((a) => {
          const p = localParts(a.starts_at);
          const s = svc(a.service_id);
          return (
            <li key={a.id}>
              <button onClick={() => go("calendar")} className="flex w-full items-center gap-3 rounded-xl p-1.5 text-start transition hover:bg-slate-50">
                <span className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-gradient-to-br ${serviceColor(s?.color).grad} text-white`}>
                  <span className="text-[10px] font-semibold leading-none">{p.day === today ? "היום" : WEEKDAYS_SHORT[p.dow]}</span>
                  <span className="text-[13px] font-bold leading-tight">{fmtTime(a.starts_at)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-slate-800">{a.customer_name}</span>
                  <span className="block truncate text-xs text-slate-500">{s?.name ?? "תור"}{a.address ? ` · ${a.address}` : ""}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function Dashboard({ org, onOpen, go, onAdd }) {
  const byStage = STAGES.map((s) => ({ ...s, items: org.leads.filter((l) => l.stage === s.id) }));
  const total = org.leads.reduce((a, l) => a + l.value, 0) || 1;
  const hot = [...org.leads].filter(isOpen).sort((a, b) => b.value - a.value).slice(0, 4);
  const recent = [...org.leads].sort((a, b) => (a.created < b.created ? 1 : -1)).slice(0, 5);
  return (
    <div className="flex flex-col gap-5">
      {org.leads.length === 0 && <Welcome name={org.name} onAdd={onAdd} go={go} />}
      <Kpis leads={org.leads} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="animate-fade-up p-6 lg:col-span-2" style={{ animationDelay: "120ms" }}>
          <SectionTitle icon={Activity} action={
            <button onClick={() => go("kanban")} className="group inline-flex items-center gap-1 rounded-full bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-100">
              לקנבאן <ArrowLeft size={15} className="transition group-hover:-translate-x-1" />
            </button>
          }>חלוקת צנרת לפי שלב</SectionTitle>
          <div className="mt-5 flex h-3.5 gap-0.5 overflow-hidden rounded-full bg-slate-100">
            {byStage.map((s) => <div key={s.id} className={`${s.dot} transition-all duration-700`} style={{ width: `${(s.items.reduce((a, l) => a + l.value, 0) / total) * 100}%` }} />)}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {byStage.map((s) => (
              <div key={s.id} className={`rounded-xl ${s.soft} p-3`}>
                <div className={`flex items-center gap-1.5 text-sm font-medium ${s.text}`}><span className={`h-2 w-2 rounded-full ${s.dot}`} />{s.label}</div>
                <div className="mt-1 text-lg font-bold tabular-nums text-slate-900">{ils(s.items.reduce((a, l) => a + l.value, 0))}</div>
                <div className="text-xs text-slate-500">{s.items.length} לידים</div>
              </div>
            ))}
          </div>
          <h3 className="mt-7 text-base font-semibold text-slate-800">עסקאות פתוחות מובילות</h3>
          {hot.length === 0 && <p className="mt-3 text-sm text-slate-500">אין עדיין לידים פתוחים.</p>}
          <ul className="mt-2 flex flex-col gap-1">
            {hot.map((l) => (
              <li key={l.id}>
                <button onClick={() => onOpen(l)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-start transition hover:bg-rose-50/60">
                  <Avatar member={org.members.find((m) => m.id === l.owner)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-slate-800">{l.name}</span>
                    <span className="text-xs text-slate-500">{STAGES.find((s) => s.id === l.stage).label}</span>
                  </span>
                  <span className="text-[15px] font-bold tabular-nums text-slate-900">{ils(l.value)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <div className="flex flex-col gap-5">
        <UpcomingAppointments org={org} go={go} />
        <Reminders leads={org.leads} onOpen={onOpen} />
        <Card className="animate-fade-up p-6" style={{ animationDelay: "180ms" }}>
          <SectionTitle icon={Sparkles} color="text-violet-500">לידים אחרונים</SectionTitle>
          {recent.length === 0 && <p className="mt-4 text-sm text-slate-500">הלידים שתוסיפו יופיעו כאן.</p>}
          <ol className="mt-4 flex flex-col gap-3">
            {recent.map((l) => {
              const stage = STAGES.find((s) => s.id === l.stage);
              const owner = org.members.find((m) => m.id === l.owner);
              return (
                <li key={l.id}>
                  <button onClick={() => onOpen(l)} className="flex w-full gap-3 rounded-xl p-1.5 text-start transition hover:bg-slate-50">
                    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${stage.soft} ${stage.text}`}><UserPlus size={16} /></span>
                    <span className="min-w-0">
                      <span className="block text-[15px] font-medium leading-snug text-slate-800">{l.name} · {stage.label}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{owner ? owner.name : "ללא שיוך"} · {l.created.split("-").reverse().join("/")}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </Card>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------- analytics --------------------------------- */

function Analytics({ org }) {
  const now = new Date();
  const MONTHLY = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const v = org.leads.filter((l) => l.stage === "won" && l.created.startsWith(key)).reduce((a, l) => a + l.value, 0);
    return { m: HE_MONTHS[d.getMonth()], v };
  });
  const max = Math.max(1, ...MONTHLY.map((d) => d.v));
  const sources = Object.entries(org.leads.reduce((acc, l) => { const k = l.source || "לא צוין"; return { ...acc, [k]: (acc[k] || 0) + 1 }; }, {})).sort((a, b) => b[1] - a[1]);
  const perAgent = org.members.map((m) => ({ m, won: org.leads.filter((l) => l.owner === m.id && l.stage === "won").reduce((a, l) => a + l.value, 0), count: org.leads.filter((l) => l.owner === m.id).length })).filter((x) => x.count);
  const agentMax = Math.max(1, ...perAgent.map((x) => x.won));
  return (
    <div className="flex flex-col gap-5">
      <Kpis leads={org.leads} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="animate-fade-up p-6 lg:col-span-2">
          <SectionTitle icon={ChartColumn}>הכנסות חודשיות (₪)</SectionTitle>
          <p className="text-sm text-slate-500">עסקאות שנסגרו, לפי חודש פתיחת הליד</p>
          <div className="mt-6 flex h-52 items-end gap-3">
            {MONTHLY.map((d, i) => (
              <div key={d.m} className="group flex flex-1 flex-col items-center gap-2">
                <span className="text-xs font-semibold tabular-nums text-slate-500 transition group-hover:text-rose-600">{Math.round(d.v / 1000)}K</span>
                <div className={`w-full origin-bottom rounded-t-xl transition duration-300 group-hover:scale-y-105 ${i === MONTHLY.length - 1 ? "border-2 border-dashed border-rose-300 bg-rose-100" : "bg-gradient-to-t from-rose-400 to-pink-400 group-hover:from-rose-500 group-hover:to-pink-500"}`} style={{ height: `${Math.max(6, (d.v / max) * 150)}px` }} />
                <span className="text-sm text-slate-600">{d.m}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card className="animate-fade-up p-6" style={{ animationDelay: "80ms" }}>
          <SectionTitle icon={Globe} color="text-sky-500">מקורות לידים</SectionTitle>
          {sources.length === 0 && <p className="mt-4 text-sm text-slate-500">עוד אין נתונים.</p>}
          <ul className="mt-4 flex flex-col gap-3.5">
            {sources.map(([s, n]) => (
              <li key={s}>
                <div className="flex justify-between text-sm"><span className="font-medium text-slate-700">{s}</span><span className="tabular-nums text-slate-500">{n}</span></div>
                <div className="mt-1.5 h-2.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-l from-sky-400 to-indigo-500 transition-all duration-700" style={{ width: `${(n / org.leads.length) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card className="animate-fade-up p-6" style={{ animationDelay: "140ms" }}>
        <SectionTitle icon={Users} color="text-emerald-500">ביצועי צוות · הכנסות שנסגרו</SectionTitle>
        {perAgent.length === 0 && <p className="mt-4 text-sm text-slate-500">כשתשייכו לידים לחברי צוות, הביצועים יופיעו כאן.</p>}
        <ul className="mt-4 flex flex-col gap-3.5">
          {perAgent.map(({ m, won, count }) => (
            <li key={m.id} className="flex items-center gap-3">
              <Avatar member={m} size="h-9 w-9 text-xs" />
              <span className="w-32 shrink-0 truncate text-[15px] font-medium text-slate-700">{m.name}</span>
              <div className="h-3 flex-1 rounded-full bg-slate-100"><div className="h-full rounded-full bg-gradient-to-l from-emerald-400 to-teal-500 transition-all duration-700" style={{ width: `${(won / agentMax) * 100}%` }} /></div>
              <span className="w-28 shrink-0 text-start text-[15px] font-bold tabular-nums text-slate-900">{ils(won)}</span>
              <span className="hidden w-16 shrink-0 text-sm text-slate-500 sm:block">{count} לידים</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

/* ------------------------------ team & permissions ----------------------------- */

const PERMS = [
  { label: "צפייה ועריכת לידים משויכים", admin: true, agent: true, viewer: false },
  { label: "צפייה בכל לידי הארגון", admin: true, agent: false, viewer: true },
  { label: "צפייה בדוחות ואנליטיקה", admin: true, agent: false, viewer: true },
  { label: "מחיקת לידים", admin: true, agent: false, viewer: false },
  { label: "הזמנת משתמשים וניהול הרשאות", admin: true, agent: false, viewer: false },
  { label: "חיוב והגדרות ארגון", admin: true, agent: false, viewer: false },
];

function Team({ org, onInvite, onRole, onRemove, notify, canManage, meId }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Agent");
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const submit = (e) => {
    e.preventDefault();
    if (!valid) return;
    if (org.members.some((m) => m.email === email)) return notify("המשתמש כבר חבר בארגון");
    onInvite(email, role).then((ok) => ok && setEmail(""));
  };
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
      <div className="flex flex-col gap-5 xl:col-span-2">
        {canManage && <Card className="animate-fade-up p-6">
          <SectionTitle icon={UserPlus}>הזמנת חבר צוות</SectionTitle>
          <p className="mt-1 text-sm text-slate-500">ההזמנה תישלח במייל ותהיה בתוקף 7 ימים. המשתמש יצורף רק לארגון {org.name}.</p>
          <form onSubmit={submit} className="mt-4 flex flex-col gap-2.5 sm:flex-row">
            <div className="relative flex-1">
              <Mail size={17} className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="invite-email" dir="ltr" type="email" placeholder="name@company.co.il" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} pe-10`} aria-label="אימייל להזמנה" />
            </div>
            <div className="flex rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="תפקיד">
              {["Agent", "Admin", "Viewer"].map((r) => (
                <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => setRole(r)}
                  className={`flex-1 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition duration-200 ${role === r ? "bg-white text-rose-600 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}>{r}</button>
              ))}
            </div>
            <Btn type="submit" disabled={!valid}><Send size={17} />שליחת הזמנה</Btn>
          </form>
        </Card>}
        <Card className="animate-fade-up overflow-hidden" style={{ animationDelay: "80ms" }}>
          <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
            <h3 className="text-base font-semibold text-slate-800">חברי הארגון</h3>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-medium text-slate-600 tabular-nums">{org.members.length} משתמשים</span>
          </div>
          <ul className="divide-y divide-slate-100">
            {org.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-6 py-3.5 transition hover:bg-slate-50/70">
                <Avatar member={m} size="h-10 w-10 text-sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[15px] font-semibold text-slate-800">
                    {m.name}
                    {m.status === "pending" && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 text-xs font-medium text-amber-700">ממתין לאישור</span>}
                  </div>
                  <div className="truncate text-sm text-slate-500" dir="ltr" style={{ textAlign: "right" }}>{m.email}</div>
                </div>
                {m.role === "Owner" || !canManage || m.id === meId ? <RoleBadge role={m.role} /> : (
                  <select id={`role-${m.id}`} aria-label={`תפקיד של ${m.name}`} value={m.role} onChange={(e) => onRole(m.id, e.target.value)}
                    className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 focus:outline-none focus:ring-4 focus:ring-rose-100">
                    <option>Admin</option><option>Agent</option><option>Viewer</option>
                  </select>
                )}
                {m.role !== "Owner" && canManage && m.id !== meId && (
                  <button onClick={() => onRemove(m.id)} aria-label={`הסרת ${m.name}`} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={17} /></button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card className="h-fit animate-fade-up p-6" style={{ animationDelay: "140ms" }}>
        <SectionTitle icon={ShieldCheck} color="text-emerald-500">מטריצת הרשאות</SectionTitle>
        <table className="mt-4 w-full">
          <thead>
            <tr className="text-xs text-slate-500"><th className="pb-2 text-start font-semibold">יכולת</th><th className="pb-2 font-semibold">Admin</th><th className="pb-2 font-semibold">Agent</th><th className="pb-2 font-semibold">Viewer</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {PERMS.map((p) => (
              <tr key={p.label}>
                <td className="py-3 pe-2 text-sm text-slate-700">{p.label}</td>
                {[p.admin, p.agent, p.viewer].map((ok, i) => (
                  <td key={i} className="py-3 text-center">
                    {ok
                      ? <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check size={14} strokeWidth={3} /></span>
                      : <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-slate-400"><X size={13} strokeWidth={3} /></span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ---------------------------------- settings ---------------------------------- */

function OrgSettings({ org, onSave, canManage }) {
  const [d, setD] = useState({ name: org.name, domain: org.domain, autoBirthday: org.autoBirthday, autoService: org.autoService });
  return (
    <div className="grid max-w-3xl grid-cols-1 gap-5">
      <Card className="animate-fade-up p-6">
        <SectionTitle icon={Building2}>פרטי הארגון</SectionTitle>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="שם הארגון"><input id="org-name" className={inputCls} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
          <Field label="דומיין"><input id="org-domain" dir="ltr" className={inputCls} value={d.domain} onChange={(e) => setD({ ...d, domain: e.target.value })} /></Field>
          <Field label="מזהה Tenant"><input id="org-id" dir="ltr" readOnly className={`${inputCls} bg-slate-50 text-slate-500`} value={org.id} /></Field>
          <Field label="מטבע ואזור זמן"><input id="org-locale" readOnly className={`${inputCls} bg-slate-50 text-slate-500`} value="₪ ILS · Asia/Jerusalem" /></Field>
        </div>
        {canManage && <div className="mt-6 flex justify-end"><Btn onClick={() => onSave(d)} disabled={!d.name.trim()}><Check size={17} />שמירה</Btn></div>}
      </Card>
      <Card className="animate-fade-up p-6" style={{ animationDelay: "60ms" }}>
        <SectionTitle icon={BellRing} color="text-sky-500">הודעות אוטומטיות ללקוחות</SectionTitle>
        <p className="mt-1 text-sm text-slate-500">נשלחות כל בוקר מ-crm@nitzanet.co.il בשם הארגון, ללקוחות שיש להם כתובת מייל.</p>
        <div className="mt-4 flex flex-col gap-3">
          <Toggle checked={d.autoBirthday} disabled={!canManage} onChange={(v) => setD({ ...d, autoBirthday: v })}
            icon={Cake} title="ברכת יום הולדת" text="מייל ברכה חגיגי ביום ההולדת של הלקוח" />
          <Toggle checked={d.autoService} disabled={!canManage} onChange={(v) => setD({ ...d, autoService: v })}
            icon={Wrench} title="תזכורת לשירות חוזר" text="מייל תזכורת שבוע לפני מועד השירות הבא (שנתי, חצי שנתי וכו׳)" />
        </div>
        {canManage && <div className="mt-6 flex justify-end"><Btn onClick={() => onSave(d)} disabled={!d.name.trim()}><Check size={17} />שמירה</Btn></div>}
      </Card>
      <Card className="flex animate-fade-up flex-wrap items-center justify-between gap-3 bg-gradient-to-l from-violet-50 to-rose-50 p-6" style={{ animationDelay: "80ms" }}>
        <div>
          <h3 className="text-base font-semibold text-slate-800">תוכנית {org.plan}</h3>
          <p className="text-sm text-slate-600">{org.members.filter((m) => m.status === "active").length} מתוך {org.plan === "Business" ? 50 : org.plan === "Pro" ? 15 : 3} מושבים בשימוש</p>
        </div>
        <Btn variant="ghost"><Sparkles size={17} />שדרוג תוכנית</Btn>
      </Card>
    </div>
  );
}

/* ------------------------------ cookie / a11y banner ----------------------------- */

function ConsentBanner({ onClose, a11y, setA11y }) {
  const [panel, setPanel] = useState(false);
  const toggle = (k) => setA11y({ ...a11y, [k]: !a11y[k] });
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4 lg:ps-[19rem]">
      <div className="pointer-events-auto mx-auto max-w-4xl animate-pop-in rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl shadow-slate-900/15">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600"><Cookie size={22} /></span>
          <p className="flex-1 text-sm leading-relaxed text-slate-600">
            אנו משתמשים בעוגיות חיוניות להפעלת המערכת ובעוגיות אנליטיקה לשיפור השירות, בהתאם ל<a href="#privacy" className="font-medium text-rose-600 underline-offset-2 hover:underline">מדיניות הפרטיות</a>. האתר מונגש לפי תקן ישראלי 5568 (WCAG 2.1 AA).
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Btn variant="ghost" onClick={() => setPanel((p) => !p)} aria-expanded={panel}><Accessibility size={17} />נגישות</Btn>
            <Btn variant="ghost" onClick={onClose}>חיוניות בלבד</Btn>
            <Btn onClick={onClose}>אישור הכול</Btn>
          </div>
        </div>
        {panel && (
          <div className="mt-4 grid grid-cols-1 gap-2 border-t border-slate-100 pt-4 sm:grid-cols-3">
            {[
              { k: "large", icon: Type, label: "הגדלת טקסט" },
              { k: "contrast", icon: Contrast, label: "ניגודיות גבוהה" },
              { k: "calm", icon: Activity, label: "עצירת אנימציות" },
            ].map(({ k, icon: I, label }) => (
              <button key={k} onClick={() => toggle(k)} aria-pressed={a11y[k]}
                className={`flex h-11 items-center gap-2 rounded-xl border px-3.5 text-[15px] font-medium transition ${a11y[k] ? "border-rose-300 bg-rose-50 text-rose-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                <I size={18} />{label}{a11y[k] && <Check size={16} className="ms-auto" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------ app ------------------------------------ */

const NAV = [
  { id: "dashboard", label: "דשבורד", icon: LayoutDashboard },
  { id: "kanban", label: "קנבאן לידים", icon: SquareKanban },
  { id: "calendar", label: "יומן ותורים", icon: CalendarDays },
  { id: "bot", label: "בוט WhatsApp", icon: Bot },
  { id: "automations", label: "אוטומציות", icon: Zap },
  { id: "analytics", label: "אנליטיקה", icon: ChartColumn },
  { id: "team", label: "ניהול צוות", icon: Users },
  { id: "settings", label: "הגדרות ארגון", icon: Settings },
];
const TITLES = {
  dashboard: ["דשבורד", "תמונת מצב של הארגון"],
  kanban: ["קנבאן לידים", "גררו כרטיסיות בין השלבים לעדכון סטטוס"],
  calendar: ["יומן ותורים", "שירותים, שעות זמינות, דף הזמנה ציבורי ויומן שבועי"],
  bot: ["בוט WhatsApp", "בוט שעונה ללקוחות וקובע תורים ב-WhatsApp העסקי"],
  automations: ["אוטומציות", "אישורים ותזכורות אוטומטיים ללקוחות"],
  analytics: ["אנליטיקה", "מגמות הכנסה, מקורות וביצועי צוות"],
  team: ["ניהול צוות והרשאות", "הזמנת משתמשים והגדרת תפקידי Admin / Agent / Viewer"],
  settings: ["הגדרות ארגון", "פרטי ה-Tenant, תוכנית וחיוב"],
};

const ORG_KEY = "pulse:last-org";
const CONSENT_KEY = "pulse:consent";
const readLastOrg = () => { try { return localStorage.getItem(ORG_KEY); } catch { return null; } };
const writeLastOrg = (id) => { try { localStorage.setItem(ORG_KEY, id); } catch {} };

const greeting = (h) => (h >= 5 && h < 12 ? "בוקר טוב" : h >= 12 && h < 17 ? "צהריים טובים" : h >= 17 && h < 21 ? "ערב טוב" : "לילה טוב");
const heDate = (d) => new Intl.DateTimeFormat("he-IL", { weekday: "long", day: "numeric", month: "long" }).format(d);

// Confetti burst shown with the hearts
const CONFETTI = Array.from({ length: 22 }, (_, i) => {
  const a = (i / 22) * Math.PI * 2;
  const dist = 120 + (i % 4) * 45;
  return {
    dx: `${Math.round(Math.cos(a) * dist)}px`,
    dy: `${Math.round(Math.sin(a) * dist - 60)}px`,
    r: `${(i % 2 ? 1 : -1) * (180 + i * 25)}deg`,
    c: ["bg-rose-500", "bg-amber-400", "bg-violet-500", "bg-sky-400", "bg-emerald-400", "bg-pink-400"][i % 6],
    round: i % 3 === 0,
  };
});

// Floating hearts shown when a deal is won
const HEART_SPOTS = [
  { x: -70, d: 0 }, { x: -30, d: 120 }, { x: 10, d: 40 }, { x: 45, d: 180 }, { x: 80, d: 90 }, { x: -5, d: 240 },
];

export default function PulseCRM({ initialOrgs, userId, providers, siteUrl }) {
  const [db] = useState(createClient);
  const router = useRouter();

  const [orgs, setOrgs] = useState(initialOrgs);
  const [orgId, setOrgId] = useState(initialOrgs[0].id);
  const [page, setPage] = useState("dashboard");
  const [lead, setLead] = useState(null);
  const [query, setQuery] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const [newOrgOpen, setNewOrgOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [banner, setBanner] = useState(true);
  const [a11y, setA11y] = useState({ large: false, contrast: false, calm: false });
  const [toast, setToast] = useState(null);
  const [hearts, setHearts] = useState(0);
  const toastTimer = useRef(null);
  const [calendarTab, setCalendarTab] = useState(null);

  // Restore the last active org after hydration
  useEffect(() => {
    const last = readLastOrg();
    if (last && last !== orgId && initialOrgs.some((o) => o.id === last)) setOrgId(last); // eslint-disable-line react-hooks/set-state-in-effect
    try { if (localStorage.getItem(CONSENT_KEY)) setBanner(false); } catch {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shortcutNew = useRef(null);
  // Shortcuts: N opens a new lead, / jumps to search. Re-bound each render so it sees current state.
  useEffect(() => {
    const h = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      if (e.key === "/") { e.preventDefault(); document.getElementById("global-search")?.focus(); }
      else if ((e.key === "n" || e.key === "N" || e.key === "מ") && shortcutNew.current) { e.preventDefault(); shortcutNew.current(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const org = orgs.find((o) => o.id === orgId) ?? orgs[0];
  const me = org.members.find((m) => m.id === userId) ?? { id: userId, name: "אני", email: "", role: org.myRole, status: "active", color: 0 };
  const isAdmin = org.myRole === "Owner" || org.myRole === "Admin";
  const canEdit = org.myRole !== "Viewer";
  const notify = (msg, kind = "ok") => { setToast({ msg, kind }); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2800); };
  const celebrate = (msg) => { setHearts((n) => n + 1); notify(msg, "win"); };
  const patchOrg = (fn) => setOrgs((all) => all.map((o) => (o.id === org.id ? fn(o) : o)));
  const fail = (error, msg = "הפעולה נכשלה") => { console.error(error); notify(error?.code === "42501" || error?.code === "PGRST116" ? "אין לך הרשאה לפעולה הזו" : msg, "error"); };

  // Back from Google OAuth (/api/calendar/google/callback?calendar=...)
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("calendar");
    if (!result) return;
    window.history.replaceState(null, "", window.location.pathname);
    const msg = { connected: ["יומן Google חובר! התורים הקרובים מסונכרנים אליו", "win"], denied: ["החיבור ל-Google בוטל", "error"], forbidden: ["רק מנהלי הארגון יכולים לחבר יומן", "error"], not_configured: ["חיבור Google עוד לא הוגדר בשרת", "error"], failed: ["החיבור ל-Google נכשל, נסו שוב", "error"] }[result];
    if (msg) { setPage("calendar"); setCalendarTab("page"); notify(...msg); } // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const switchOrg = (id) => { setOrgId(id); writeLastOrg(id); setNavOpen(false); notify("הוחלף ארגון פעיל"); };

  const moveLead = async (id, stage) => {
    const l = org.leads.find((x) => x.id === id);
    if (!l || l.stage === stage || !canEdit) return;
    patchOrg((o) => ({ ...o, leads: o.leads.map((x) => (x.id === id ? { ...x, stage } : x)) }));
    const { error } = await db.from("leads").update({ stage }).eq("id", id).select("id").single();
    if (error) {
      patchOrg((o) => ({ ...o, leads: o.leads.map((x) => (x.id === id ? { ...x, stage: l.stage } : x)) }));
      return fail(error);
    }
    if (stage === "won") return celebrate(`איזה יופי! העסקה עם ${l.name} נסגרה`);
    notify(`${l.name} הועבר ל״${STAGES.find((s) => s.id === stage).label}״`);
  };
  const saveLead = async (d) => {
    const prev = org.leads.find((l) => l.id === d.id);
    const exists = !!prev;
    const { data, error } = exists
      ? await db.from("leads").update(toRow(d)).eq("id", d.id).select().single()
      : await db.from("leads").insert({ ...toRow(d), id: d.id, org_id: org.id }).select().single();
    if (error) return fail(error, "שמירת הליד נכשלה");
    const saved = { ...d, created: data.created_at.slice(0, 10) };
    patchOrg((o) => ({ ...o, leads: exists ? o.leads.map((l) => (l.id === d.id ? saved : l)) : [saved, ...o.leads] }));
    setLead(null);
    if (d.stage === "won" && prev?.stage !== "won") return celebrate(`איזה יופי! העסקה עם ${d.name} נסגרה`);
    notify(exists ? "הליד עודכן" : "ליד חדש נוסף ללוח");
  };
  const deleteLead = async (id) => {
    const { error } = await db.from("leads").delete().eq("id", id).select("id").single();
    if (error) return fail(error, "מחיקת הליד נכשלה");
    patchOrg((o) => ({ ...o, leads: o.leads.filter((l) => l.id !== id) }));
    setLead(null);
    notify("הליד נמחק");
  };
  const newLead = () => setLead({ id: crypto.randomUUID(), name: "", contact: "", phone: "", email: "", value: 0, stage: "new", owner: userId, tags: [], source: "ידני", created: today(), note: "", birthday: "", serviceMonths: null, lastService: "" });

  useEffect(() => { shortcutNew.current = canEdit && !lead ? newLead : null; });

  const invite = async (email, role) => {
    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: org.id, email, role: ROLE_TO_DB[role] }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { notify(res.status === 403 ? "לא ניתן ליצור הזמנה (ייתכן שכבר קיימת הזמנה פתוחה)" : "שליחת ההזמנה נכשלה", "error"); return false; }
    patchOrg((o) => ({ ...o, members: [...o.members, { id: `inv_${body.id}`, inviteId: body.id, name: email.split("@")[0], email, role, status: "pending", color: o.members.length }] }));
    notify(`הזמנה נשלחה ל-${email} כ-${role}`);
    return true;
  };
  const changeRole = async (id, role) => {
    const m = org.members.find((x) => x.id === id);
    const { error } = m.inviteId
      ? await db.from("invitations").update({ role: ROLE_TO_DB[role] }).eq("id", m.inviteId).select("id").single()
      : await db.from("memberships").update({ role: ROLE_TO_DB[role] }).eq("org_id", org.id).eq("user_id", id).select("user_id").single();
    if (error) return fail(error);
    patchOrg((o) => ({ ...o, members: o.members.map((x) => (x.id === id ? { ...x, role } : x)) }));
    notify(`התפקיד עודכן ל-${role}`);
  };
  const removeMember = async (id) => {
    const m = org.members.find((x) => x.id === id);
    const { error } = m.inviteId
      ? await db.from("invitations").delete().eq("id", m.inviteId).select("id").single()
      : await db.from("memberships").delete().eq("org_id", org.id).eq("user_id", id).select("user_id").single();
    if (error) return fail(error);
    if (!m.inviteId) await db.from("leads").update({ assignee_id: null }).eq("org_id", org.id).eq("assignee_id", id);
    patchOrg((o) => ({ ...o, members: o.members.filter((x) => x.id !== id), leads: o.leads.map((l) => (l.owner === id ? { ...l, owner: null } : l)) }));
    notify(m.inviteId ? "ההזמנה בוטלה" : "המשתמש הוסר מהארגון");
  };

  const createOrg = async () => {
    const name = newOrgName.trim();
    if (!name) return;
    const { data, error } = await db.rpc("create_organization", { _name: name, _slug: slugify(name) });
    if (error) return fail(error, "יצירת הארגון נכשלה");
    // The database seeds opening hours and booking automations for every new org
    const [rulesRes, autoRes, botRes, faqsRes, menuRes] = await Promise.all([
      db.from("availability_rules").select("weekday, start_time, end_time").eq("org_id", data.id).order("weekday"),
      db.from("automations").select("*").eq("org_id", data.id),
      db.from("bot_settings").select("*").eq("org_id", data.id).maybeSingle(),
      db.from("bot_faqs").select("*").eq("org_id", data.id).order("position"),
      db.from("bot_menu_items").select("*").eq("org_id", data.id).order("position"),
    ]);
    const created = {
      id: data.id, slug: data.slug, name: data.name, plan: data.plan, domain: "", color: "from-emerald-400 to-teal-500", autoBirthday: true, autoService: true, myRole: "Owner",
      members: [{ ...me, role: "Owner", color: 0 }], leads: [],
      booking: { enabled: data.booking_enabled, headline: "", slotMinutes: data.booking_slot_minutes, bufferMinutes: data.booking_buffer_minutes, minNoticeHours: data.booking_min_notice_hours, maxDays: data.booking_max_days },
      services: [], rules: rulesRes.data ?? [], blocks: [], appointments: [], automations: autoRes.data ?? [], jobs: [], calendars: [],
      bot: { settings: botRes.data ?? null, scripts: {}, faqs: faqsRes.data ?? [], menu: menuRes.data ?? [] },
    };
    setOrgs((all) => [...all, created]);
    setOrgId(created.id); writeLastOrg(created.id); setNewOrgOpen(false); setNewOrgName(""); setPage("dashboard");
    notify(`הארגון ${name} נוצר`);
  };
  const saveOrg = async (d) => {
    const { error } = await db.from("organizations")
      .update({ name: d.name.trim(), domain: d.domain || null, auto_birthday_email: d.autoBirthday, auto_service_reminder: d.autoService })
      .eq("id", org.id).select("id").single();
    if (error) return fail(error, "שמירת ההגדרות נכשלה");
    patchOrg((o) => ({ ...o, ...d }));
    notify("הגדרות הארגון נשמרו");
  };
  const signOut = async () => { await db.auth.signOut(); router.replace("/login"); router.refresh(); };

  const todayCount = org.appointments.filter((a) => (a.status === "confirmed" || a.status === "pending") && localParts(a.starts_at).day === todayKey()).length;
  const moduleProps = { org, db, userId, canEdit, isAdmin, notify, fail, patchOrg, siteUrl, providers, onOpenLead: setLead };

  const [title, subtitle] = TITLES[page];
  const rootCls = [
    "min-h-screen bg-[#fdf8fa] text-slate-800 antialiased selection:bg-rose-200",
    a11y.large ? "text-[18px] [&_.text-xs]:text-sm [&_.text-sm]:text-base" : "",
    a11y.contrast ? "[&_.text-slate-500]:text-slate-800 [&_.text-slate-400]:text-slate-700 [&_.text-slate-600]:text-slate-900" : "",
    a11y.calm ? "[&_*]:!transition-none [&_*]:!animate-none" : "",
  ].join(" ");

  const Sidebar = (
    <aside className="flex h-full w-72 flex-col gap-5 overflow-y-auto border-s border-slate-200/80 bg-white p-4">
      <div className="flex items-center gap-2.5 px-1 pt-1">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 shadow-lg shadow-rose-500/30">
          <Heart size={20} className="animate-heartbeat fill-white text-white" />
        </span>
        <div className="leading-tight">
          <span className="block text-lg font-bold tracking-tight text-slate-900">Pulse CRM</span>
          <span className="block text-xs text-slate-500">by Nitzanet</span>
        </div>
      </div>
      <OrgSwitcher orgs={orgs} current={org} onSwitch={switchOrg} onCreate={() => setNewOrgOpen(true)} />
      <nav className="flex flex-col gap-1" aria-label="ניווט ראשי">
        {NAV.map((n) => {
          const active = page === n.id;
          return (
            <button key={n.id} onClick={() => { setPage(n.id); setNavOpen(false); }} aria-current={active ? "page" : undefined}
              className={`group flex h-12 items-center gap-3 rounded-xl px-3.5 text-[15px] font-medium transition duration-200 ${active ? "bg-gradient-to-l from-rose-500 to-pink-500 text-white shadow-md shadow-rose-500/25" : "text-slate-600 hover:bg-rose-50 hover:text-rose-700"}`}>
              <n.icon size={20} className={active ? "" : "transition group-hover:animate-wiggle"} />{n.label}
              {n.id === "kanban" && <span className={`ms-auto rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${active ? "bg-white/25 text-white" : "bg-rose-100 text-rose-700"}`}>{org.leads.filter(isOpen).length}</span>}
              {n.id === "calendar" && todayCount > 0 && <span suppressHydrationWarning className={`ms-auto rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${active ? "bg-white/25 text-white" : "bg-violet-100 text-violet-700"}`}>{todayCount} היום</span>}
            </button>
          );
        })}
      </nav>
      <div className="mt-auto flex shrink-0 items-center gap-3 rounded-2xl bg-slate-50 p-3">
        <Avatar member={me} size="h-10 w-10 text-sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-slate-800">{me.name}</div>
          <div className="text-xs text-slate-500">{me.role}</div>
        </div>
        <button onClick={signOut} aria-label="התנתקות" title="התנתקות" className="rounded-lg p-2 text-slate-400 transition hover:bg-white hover:text-rose-600 hover:shadow-sm"><LogOut size={18} /></button>
      </div>
    </aside>
  );

  return (
    <div dir="rtl" lang="he" className={rootCls}>
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_55%_40%_at_85%_-5%,rgba(244,63,94,0.10),transparent),radial-gradient(ellipse_45%_35%_at_0%_100%,rgba(139,92,246,0.08),transparent),radial-gradient(ellipse_35%_30%_at_40%_50%,rgba(14,165,233,0.05),transparent)]" />

      <div className="relative flex min-h-screen">
        <div className="sticky top-0 hidden h-screen lg:block">{Sidebar}</div>
        {navOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden" onClick={() => setNavOpen(false)}>
            <div className="animate-pop-in" onClick={(e) => e.stopPropagation()}>{Sidebar}</div>
            <div className="flex-1 bg-slate-900/40 backdrop-blur-sm" />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 py-3.5 backdrop-blur-xl sm:px-8">
            <button className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 lg:hidden" onClick={() => setNavOpen(true)} aria-label="פתיחת תפריט"><Menu size={22} /></button>
            <div className="min-w-0 flex-1">
              {page === "dashboard" ? (
                <>
                  <h1 suppressHydrationWarning className="truncate text-2xl font-bold tracking-tight text-slate-900">{greeting(new Date().getHours())}, {me.name.split(" ")[0]} <Sparkles size={22} className="inline-block animate-wiggle text-amber-400" /></h1>
                  <p suppressHydrationWarning className="hidden truncate text-sm text-slate-500 sm:block">
                    {heDate(new Date())} · {org.leads.filter(isOpen).length ? `${org.leads.filter(isOpen).length} לידים פתוחים מחכים לך היום` : "יום מצוין להוסיף ליד חדש"}
                  </p>
                </>
              ) : (
                <>
                  <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
                  <p className="hidden truncate text-sm text-slate-500 sm:block">{subtitle}</p>
                </>
              )}
            </div>
            <div className="relative hidden md:block">
              <Search size={18} className="pointer-events-none absolute end-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input id="global-search" value={query} onChange={(e) => { setQuery(e.target.value); if (e.target.value && page !== "kanban") setPage("kanban"); }}
                placeholder="חיפוש לידים, תגיות..." className={`${inputCls} w-72 pe-10 ps-10`} aria-label="חיפוש" />
              <kbd className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-slate-50 px-1.5 text-xs font-semibold text-slate-400">/</kbd>
            </div>
            <button className="group relative flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-rose-200 hover:text-rose-600" aria-label="התראות">
              <Bell size={19} className="group-hover:animate-wiggle" />
              <span className="absolute end-2.5 top-2.5 h-2 w-2 animate-heartbeat rounded-full bg-rose-500 ring-2 ring-white" />
            </button>
            {canEdit && <Btn onClick={newLead} title="קיצור מקלדת: N" className="max-sm:hidden"><Plus size={18} />ליד חדש</Btn>}
          </header>

          <main className="flex-1 px-4 py-6 sm:px-8">
            <div className="mb-5 flex items-center gap-2 text-sm text-slate-500">
              <Building2 size={15} /><span>{org.name}</span><span className="text-slate-300">/</span><span className="font-medium text-slate-700">{title}</span>
              <span className="ms-auto flex items-center gap-1.5"><Clock size={14} /><RoleBadge role={org.myRole} /></span>
            </div>
            <div key={`${org.id}-${page}`} className="animate-fade-up">
            {page === "dashboard" && <Dashboard org={org} onOpen={setLead} go={setPage} onAdd={canEdit ? newLead : null} />}
            {page === "kanban" && <Kanban org={org} onMove={moveLead} onOpen={setLead} onAdd={newLead} query={query} canEdit={canEdit} />}
            {page === "calendar" && <CalendarPage key={`${org.id}-${calendarTab}`} {...moduleProps} initialTab={calendarTab} />}
            {page === "bot" && <BotAdminPage key={org.id} {...moduleProps} />}
            {page === "automations" && <AutomationsPage key={org.id} {...moduleProps} />}
            {page === "analytics" && <Analytics org={org} />}
            {page === "team" && <Team org={org} onInvite={invite} onRole={changeRole} onRemove={removeMember} notify={notify} canManage={isAdmin} meId={userId} />}
            {page === "settings" && <OrgSettings key={org.id} org={org} onSave={saveOrg} canManage={isAdmin} />}
            </div>
          </main>

          <footer className={`border-t border-slate-200/70 px-4 py-6 text-sm text-slate-500 sm:px-8 ${banner ? "pb-52 sm:pb-36" : ""}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-1.5">© 2026 ניצנט בע״מ · נבנה עם <Heart size={14} className="animate-heartbeat fill-rose-500 text-rose-500" /> · Pulse CRM</p>
              <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="קישורים משפטיים">
                <a href="#terms" className="transition hover:text-rose-600">תנאי שימוש</a>
                <a href="#privacy" className="transition hover:text-rose-600">מדיניות פרטיות</a>
                <a href="#accessibility" className="transition hover:text-rose-600">הצהרת נגישות</a>
                <a href="#dpa" className="transition hover:text-rose-600">הסכם עיבוד נתונים (DPA)</a>
                <button onClick={() => setBanner(true)} className="transition hover:text-rose-600">הגדרות עוגיות</button>
              </nav>
            </div>
          </footer>
        </div>
      </div>

      <LeadModal key={lead?.id ?? "none"} lead={lead} org={org} onClose={() => setLead(null)} onSave={saveLead} onDelete={deleteLead} canEdit={canEdit} canDelete={isAdmin} />

      <Modal open={newOrgOpen} onClose={() => setNewOrgOpen(false)} title="הוספת עסק חדש">
        <p className="mb-4 text-[15px] text-slate-600">כל עסק מקבל סביבה מבודדת עם לידים, צוות והגדרות משלו. תוכלו לעבור ביניהם מהתפריט הצדדי.</p>
        <Field label="שם העסק"><input id="new-org-name" autoFocus className={inputCls} placeholder="למשל: קפה ארומה" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createOrg()} /></Field>
        <div className="mt-6 flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setNewOrgOpen(false)}>ביטול</Btn>
          <Btn onClick={createOrg} disabled={!newOrgName.trim()}><Plus size={17} />יצירת ארגון</Btn>
        </div>
      </Modal>

      {canEdit && !banner && page !== "bot" && (
        <button onClick={newLead} aria-label="ליד חדש"
          className="fixed bottom-5 end-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-xl shadow-rose-500/40 transition active:scale-90 sm:hidden">
          <Plus size={26} strokeWidth={2.5} />
        </button>
      )}

      {banner && <ConsentBanner onClose={() => { setBanner(false); try { localStorage.setItem(CONSENT_KEY, "1"); } catch {} }} a11y={a11y} setA11y={setA11y} />}

      {hearts > 0 && (
        <div key={hearts} aria-hidden className="pointer-events-none fixed bottom-24 left-1/2 z-[60]">
          {CONFETTI.map((c, i) => (
            <span key={`c${i}`} className={`absolute h-2.5 w-2.5 animate-confetti ${c.c} ${c.round ? "rounded-full" : "rounded-sm"}`} style={{ "--dx": c.dx, "--dy": c.dy, "--r": c.r }} />
          ))}
          {HEART_SPOTS.map((h, i) => (
            <Heart key={i} size={22 + (i % 3) * 6} className="absolute animate-float-heart fill-rose-500 text-rose-500" style={{ left: h.x, animationDelay: `${h.d}ms` }} />
          ))}
        </div>
      )}

      {toast && (
        <div role="status" key={toast.msg} className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2">
          <div className="flex animate-pop-in items-center gap-3 rounded-2xl border border-slate-200 bg-white py-3 pe-5 ps-3 text-[15px] font-medium text-slate-800 shadow-2xl shadow-slate-900/15">
            {toast.kind === "win"
              ? <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-100"><Heart size={18} className="animate-heartbeat fill-rose-500 text-rose-500" /></span>
              : toast.kind === "error"
                ? <span className="flex h-9 w-9 items-center justify-center rounded-full bg-red-100 text-red-600"><X size={18} strokeWidth={3} /></span>
                : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Check size={18} strokeWidth={3} /></span>}
            {toast.msg}
          </div>
        </div>
      )}
    </div>
  );
}
