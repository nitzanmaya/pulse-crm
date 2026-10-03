"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard, SquareKanban, ChartColumn, Users, Settings, ChevronsUpDown, Plus, Check,
  Search, Bell, X, Mail, ShieldCheck, UserPlus, TrendingUp, TrendingDown, Wallet, Target,
  Clock, Tag, Phone, Building2, Cookie, Accessibility, Trash2, Calendar, Sparkles, LogOut,
  Menu, Activity, Type, Contrast, GripVertical, Send, Crown, Globe, Percent,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Pulse CRM · Nitzanet                                               */
/*  Multi-tenant SaaS CRM dashboard (mock data, client-side only).     */
/*  Each organization (tenant) owns its own leads + members. Swap the  */
/*  SEED object for API calls scoped by org id when wiring a backend.  */
/* ------------------------------------------------------------------ */

const STAGES = [
  { id: "new", label: "לידים חדשים", dot: "bg-sky-400" },
  { id: "in_progress", label: "בטיפול", dot: "bg-amber-400" },
  { id: "proposal", label: "הצעת מחיר", dot: "bg-violet-400" },
  { id: "won", label: "עסקה נסגרה", dot: "bg-emerald-400" },
  { id: "lost", label: "הפסד", dot: "bg-rose-400" },
];
const isOpen = (l) => l.stage !== "won" && l.stage !== "lost";

const TAG_STYLES = {
  "חם": "bg-rose-500/10 text-rose-300 border-rose-500/20",
  "VIP": "bg-amber-500/10 text-amber-300 border-amber-500/20",
  "אתר": "bg-sky-500/10 text-sky-300 border-sky-500/20",
  "SEO": "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  "קמפיין": "bg-violet-500/10 text-violet-300 border-violet-500/20",
  "ריטיינר": "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
  "הפניה": "bg-teal-500/10 text-teal-300 border-teal-500/20",
};
const tagClass = (t) => TAG_STYLES[t] || "bg-white/5 text-zinc-300 border-white/10";

const AVATAR_COLORS = ["from-sky-500 to-indigo-500", "from-emerald-500 to-teal-500", "from-amber-500 to-orange-500", "from-fuchsia-500 to-violet-500", "from-rose-500 to-pink-500"];

const ils = (n) => new Intl.NumberFormat("he-IL", { style: "currency", currency: "ILS", maximumFractionDigits: 0 }).format(n);
const initials = (name) => name.split(" ").map((p) => p[0]).slice(0, 2).join("");
const today = () => new Date().toISOString().slice(0, 10);
const HE_MONTHS = ["ינו׳", "פבר׳", "מרץ", "אפר׳", "מאי", "יוני", "יולי", "אוג׳", "ספט׳", "אוק׳", "נוב׳", "דצמ׳"];
const ROLE_TO_DB = { Admin: "admin", Agent: "agent", Viewer: "viewer" };
const slugify = (name) => {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
  return `${base.length >= 2 ? base : "org"}-${Math.random().toString(36).slice(2, 7)}`;
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
});

/* ------------------------------ primitives ------------------------------ */

const Glass = ({ className = "", children, ...rest }) => (
  <div className={`rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-xl ${className}`} {...rest}>{children}</div>
);

const Avatar = ({ member, size = "h-7 w-7 text-[11px]" }) => (
  <span title={member?.name} className={`inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${AVATAR_COLORS[(member?.color ?? 0) % AVATAR_COLORS.length]} ${size} font-semibold text-white ring-2 ring-zinc-950`}>
    {member ? initials(member.name) : "?"}
  </span>
);

const Btn = ({ variant = "primary", className = "", children, ...rest }) => {
  const v = {
    primary: "bg-white text-zinc-950 hover:bg-zinc-200",
    ghost: "border border-white/10 bg-white/[0.03] text-zinc-200 hover:bg-white/[0.07]",
    danger: "border border-rose-500/20 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20",
  }[variant];
  return (
    <button className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60 disabled:opacity-40 ${v} ${className}`} {...rest}>
      {children}
    </button>
  );
};

const Field = ({ label, children }) => (
  <label className="flex flex-col gap-1.5 text-sm">
    <span className="text-xs font-medium text-zinc-400">{label}</span>
    {children}
  </label>
);
const inputCls = "w-full rounded-lg border border-white/10 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-indigo-400/50 focus:outline-none focus:ring-2 focus:ring-indigo-400/20";

const RoleBadge = ({ role }) => {
  const s = {
    Owner: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    Admin: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
    Agent: "bg-zinc-500/10 text-zinc-300 border-white/10",
    Viewer: "bg-sky-500/10 text-sky-300 border-sky-500/20",
  }[role];
  return <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${s}`}>{role === "Owner" && <Crown size={11} />}{role}</span>;
};

const Modal = ({ open, onClose, title, children, wide }) => {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.stopPropagation()}
        className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900/95 shadow-2xl shadow-black/50`}>
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-base font-semibold text-zinc-100">{title}</h2>
          <button onClick={onClose} aria-label="סגירה" className="rounded-md p-1 text-zinc-400 hover:bg-white/5 hover:text-zinc-100"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

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
        className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-2 text-start transition hover:bg-white/[0.06]">
        <span className={`flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br ${current.color} text-sm font-bold text-white`}>{current.name[0]}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-zinc-100" dir="ltr" style={{ textAlign: "right" }}>{current.name}</span>
          <span className="block text-[11px] text-zinc-500">תוכנית {current.plan} · {current.members.length} חברים</span>
        </span>
        <ChevronsUpDown size={16} className="text-zinc-500" />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-40 mt-2 overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 p-1.5 shadow-2xl shadow-black/60 backdrop-blur-xl">
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wider text-zinc-500">הארגונים שלך</p>
          {orgs.map((o) => (
            <button key={o.id} onClick={() => { onSwitch(o.id); setOpen(false); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-200 hover:bg-white/5">
              <span className={`flex h-6 w-6 items-center justify-center rounded bg-gradient-to-br ${o.color} text-[11px] font-bold text-white`}>{o.name[0]}</span>
              <span className="flex-1 truncate text-start" dir="ltr" style={{ textAlign: "right" }}>{o.name}</span>
              {o.id === current.id && <Check size={15} className="text-indigo-400" />}
            </button>
          ))}
          <div className="my-1 h-px bg-white/10" />
          <button onClick={() => { onCreate(); setOpen(false); }}
            className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-300 hover:bg-white/5">
            <span className="flex h-6 w-6 items-center justify-center rounded border border-dashed border-white/20"><Plus size={13} /></span>
            הוספת עסק חדש
          </button>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------- KPIs ----------------------------------- */

function KpiCard({ icon: Icon, label, value, delta, hint, spark }) {
  const up = delta == null || delta >= 0;
  const max = spark ? Math.max(1, ...spark) : 1;
  const pts = spark ? spark.map((v, i) => `${(i / (spark.length - 1)) * 100},${28 - (v / max) * 24}`).join(" ") : "";
  return (
    <Glass className="p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-medium text-zinc-400"><Icon size={15} className="text-zinc-500" />{label}</span>
        {delta != null && (
          <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${up ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
            {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(delta)}%
          </span>
        )}
      </div>
      <div className="mt-3 text-2xl font-bold tracking-tight text-zinc-50 tabular-nums">{value}</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <span className="text-[11px] text-zinc-500">{hint}</span>
        {spark && (
          <svg viewBox="0 0 100 30" className="h-7 w-24" preserveAspectRatio="none" style={{ transform: "scaleX(-1)" }}>
            <polyline points={pts} fill="none" stroke={up ? "#34d399" : "#fb7185"} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </svg>
        )}
      </div>
    </Glass>
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard icon={Wallet} label="הכנסות שנסגרו" value={ils(wonValue)} hint={`${won.length} עסקאות`} />
      <KpiCard icon={Activity} label="שווי צנרת פתוחה" value={ils(pipeline)} hint={`${open.length} לידים פעילים`} />
      <KpiCard icon={Percent} label="יחס המרה" value={`${conv}%`} hint="ליד לעסקה סגורה" />
      <KpiCard icon={Target} label="עסקה ממוצעת" value={ils(avg)} hint="בעסקאות שנסגרו" />
    </div>
  );
}

/* ---------------------------------- kanban ---------------------------------- */

function LeadCard({ lead, owner, onOpen, onDragStart, dragging, draggable = true }) {
  return (
    <div draggable={draggable} onDragStart={(e) => onDragStart(e, lead.id)} onClick={() => onOpen(lead)}
      onKeyDown={(e) => e.key === "Enter" && onOpen(lead)} tabIndex={0} role="button" aria-label={`ליד: ${lead.name}`}
      className={`group cursor-grab rounded-lg border border-white/10 bg-zinc-900/80 p-3 shadow-sm transition hover:border-white/20 hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 active:cursor-grabbing ${dragging ? "opacity-40" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold leading-snug text-zinc-100">{lead.name}</h4>
        <GripVertical size={14} className="mt-0.5 shrink-0 text-zinc-600 opacity-0 transition group-hover:opacity-100" />
      </div>
      <p className="mt-0.5 text-xs text-zinc-500">{lead.contact}</p>
      {lead.tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {lead.tags.map((t) => <span key={t} className={`rounded border px-1.5 py-px text-[10.5px] font-medium ${tagClass(t)}`}>{t}</span>)}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2.5">
        <span className="text-sm font-semibold tabular-nums text-zinc-200">{ils(lead.value)}</span>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[11px] text-zinc-500"><Calendar size={11} />{lead.created.slice(5).split("-").reverse().join("/")}</span>
          <Avatar member={owner} size="h-6 w-6 text-[10px]" />
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
    <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      <div className="grid min-w-[1280px] grid-cols-5 gap-3">
        {STAGES.map((s) => {
          const items = leads.filter((l) => l.stage === s.id);
          const total = items.reduce((a, l) => a + l.value, 0);
          return (
            <section key={s.id} aria-label={s.label}
              onDragOver={(e) => { e.preventDefault(); setOver(s.id); }}
              onDragLeave={() => setOver((o) => (o === s.id ? null : o))}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain") || dragId; if (id) onMove(id, s.id); setDragId(null); setOver(null); }}
              className={`flex min-h-[420px] flex-col rounded-xl border bg-white/[0.02] transition ${over === s.id ? "border-indigo-400/40 bg-indigo-500/[0.05]" : "border-white/10"}`}>
              <header className="flex items-center justify-between px-3 py-3">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                  <h3 className="text-sm font-semibold text-zinc-200">{s.label}</h3>
                  <span className="rounded bg-white/5 px-1.5 text-[11px] font-medium text-zinc-400 tabular-nums">{items.length}</span>
                </div>
                <span className="text-[11px] font-medium text-zinc-500 tabular-nums">{ils(total)}</span>
              </header>
              <div className="flex flex-1 flex-col gap-2 px-2 pb-2" onDragEnd={() => { setDragId(null); setOver(null); }}>
                {items.map((l) => <LeadCard key={l.id} lead={l} owner={memberById(l.owner)} onOpen={onOpen} onDragStart={start} dragging={dragId === l.id} draggable={canEdit} />)}
                {items.length === 0 && <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-white/10 py-8 text-xs text-zinc-600">גררו ליד לכאן</div>}
                {s.id === "new" && canEdit && (
                  <button onClick={onAdd} className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/10 py-2 text-xs text-zinc-500 transition hover:border-white/20 hover:text-zinc-300">
                    <Plus size={14} /> ליד חדש
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------- lead modal -------------------------------- */

function LeadModal({ lead, org, onClose, onSave, onDelete, canEdit, canDelete }) {
  const [draft, setDraft] = useState(lead);
  if (!lead || !draft) return null;
  const isNew = !org.leads.some((l) => l.id === lead.id);
  const set = (k) => (e) => setDraft({ ...draft, [k]: k === "value" ? Number(e.target.value) || 0 : e.target.value });
  const toggleTag = (t) => setDraft({ ...draft, tags: draft.tags.includes(t) ? draft.tags.filter((x) => x !== t) : [...draft.tags, t] });
  const owner = org.members.find((m) => m.id === draft.owner);
  return (
    <Modal open onClose={onClose} title={isNew ? "ליד חדש" : "פרטי ליד"} wide>
      {!isNew && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <Avatar member={owner} size="h-10 w-10 text-sm" />
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold text-zinc-50">{draft.name}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
              <span className="flex items-center gap-1"><Phone size={12} /><span dir="ltr">{draft.phone}</span></span>
              <span className="flex items-center gap-1"><Mail size={12} /><span dir="ltr">{draft.email}</span></span>
              <span className="flex items-center gap-1"><Globe size={12} />{draft.source}</span>
            </div>
          </div>
          <div className="text-start">
            <div className="text-[11px] text-zinc-500">שווי עסקה</div>
            <div className="text-xl font-bold tabular-nums text-zinc-50">{ils(draft.value)}</div>
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
      <div className="mt-4">
        <span className="text-xs font-medium text-zinc-400">תגיות</span>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.keys(TAG_STYLES).map((t) => (
            <button key={t} type="button" onClick={() => toggleTag(t)} aria-pressed={draft.tags.includes(t)}
              className={`rounded-md border px-2 py-1 text-xs font-medium transition ${draft.tags.includes(t) ? tagClass(t) : "border-white/10 text-zinc-500 hover:text-zinc-300"}`}>
              <Tag size={10} className="me-1 inline" />{t}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <Field label="הערות"><textarea id="lead-note" rows={3} className={inputCls} value={draft.note} onChange={set("note")} placeholder="סיכום שיחה, צעדים הבאים..." /></Field>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
        {!isNew && canDelete ? <Btn variant="danger" onClick={() => onDelete(lead.id)}><Trash2 size={15} />מחיקת ליד</Btn> : <span />}
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={onClose}>{canEdit ? "ביטול" : "סגירה"}</Btn>
          {canEdit && <Btn disabled={!draft.name.trim()} onClick={() => onSave(draft)}><Check size={15} />{isNew ? "יצירת ליד" : "שמירת שינויים"}</Btn>}
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------- dashboard --------------------------------- */

function Dashboard({ org, onOpen, go }) {
  const byStage = STAGES.map((s) => ({ ...s, items: org.leads.filter((l) => l.stage === s.id) }));
  const total = org.leads.reduce((a, l) => a + l.value, 0) || 1;
  const hot = [...org.leads].filter(isOpen).sort((a, b) => b.value - a.value).slice(0, 4);
  const recent = [...org.leads].sort((a, b) => (a.created < b.created ? 1 : -1)).slice(0, 5);
  return (
    <div className="flex flex-col gap-4">
      <Kpis leads={org.leads} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Glass className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-200">חלוקת צנרת לפי שלב</h3>
            <button onClick={() => go("kanban")} className="text-xs text-indigo-300 hover:text-indigo-200">לקנבאן ←</button>
          </div>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-white/5">
            {byStage.map((s) => <div key={s.id} className={s.dot} style={{ width: `${(s.items.reduce((a, l) => a + l.value, 0) / total) * 100}%` }} />)}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {byStage.map((s) => (
              <div key={s.id}>
                <div className="flex items-center gap-1.5 text-xs text-zinc-400"><span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />{s.label}</div>
                <div className="mt-1 text-base font-semibold tabular-nums text-zinc-100">{ils(s.items.reduce((a, l) => a + l.value, 0))}</div>
                <div className="text-[11px] text-zinc-500">{s.items.length} לידים</div>
              </div>
            ))}
          </div>
          <h3 className="mt-6 text-sm font-semibold text-zinc-200">עסקאות פתוחות מובילות</h3>
          {hot.length === 0 && <p className="mt-3 text-xs text-zinc-500">אין עדיין לידים פתוחים.</p>}
          <ul className="mt-2 divide-y divide-white/5">
            {hot.map((l) => (
              <li key={l.id}>
                <button onClick={() => onOpen(l)} className="flex w-full items-center gap-3 rounded-md px-1 py-2.5 text-start hover:bg-white/[0.03]">
                  <Avatar member={org.members.find((m) => m.id === l.owner)} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-zinc-200">{l.name}</span>
                    <span className="text-[11px] text-zinc-500">{STAGES.find((s) => s.id === l.stage).label}</span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-zinc-200">{ils(l.value)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Glass>
        <Glass className="p-5">
          <h3 className="text-sm font-semibold text-zinc-200">לידים אחרונים</h3>
          {recent.length === 0 && <p className="mt-4 text-xs text-zinc-500">הלידים שתוסיפו יופיעו כאן.</p>}
          <ol className="mt-4 flex flex-col gap-4">
            {recent.map((l) => {
              const stage = STAGES.find((s) => s.id === l.stage);
              const owner = org.members.find((m) => m.id === l.owner);
              return (
                <li key={l.id} className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-sky-400"><UserPlus size={13} /></span>
                  <button onClick={() => onOpen(l)} className="min-w-0 text-start">
                    <p className="text-sm leading-snug text-zinc-300">{l.name} · {stage.label}</p>
                    <p className="mt-0.5 text-[11px] text-zinc-500">{owner ? owner.name : "ללא שיוך"} · {l.created.split("-").reverse().join("/")}</p>
                  </button>
                </li>
              );
            })}
          </ol>
        </Glass>
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
    <div className="flex flex-col gap-4">
      <Kpis leads={org.leads} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Glass className="p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-zinc-200">הכנסות חודשיות (₪)</h3>
          <p className="text-[11px] text-zinc-500">עסקאות שנסגרו, לפי חודש פתיחת הליד</p>
          <div className="mt-6 flex h-48 items-end gap-3">
            {MONTHLY.map((d, i) => (
              <div key={d.m} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-[11px] tabular-nums text-zinc-400">{Math.round(d.v / 1000)}K</span>
                <div className={`w-full rounded-t-md ${i === MONTHLY.length - 1 ? "bg-indigo-400/40 border border-dashed border-indigo-300/50" : "bg-gradient-to-t from-indigo-500/60 to-sky-400/80"}`} style={{ height: `${(d.v / max) * 140}px` }} />
                <span className="text-xs text-zinc-500">{d.m}</span>
              </div>
            ))}
          </div>
        </Glass>
        <Glass className="p-5">
          <h3 className="text-sm font-semibold text-zinc-200">מקורות לידים</h3>
          <ul className="mt-4 flex flex-col gap-3">
            {sources.map(([s, n]) => (
              <li key={s}>
                <div className="flex justify-between text-xs"><span className="text-zinc-300">{s}</span><span className="tabular-nums text-zinc-500">{n}</span></div>
                <div className="mt-1.5 h-1.5 rounded-full bg-white/5"><div className="h-full rounded-full bg-sky-400/70" style={{ width: `${(n / org.leads.length) * 100}%` }} /></div>
              </li>
            ))}
          </ul>
        </Glass>
      </div>
      <Glass className="p-5">
        <h3 className="text-sm font-semibold text-zinc-200">ביצועי צוות · הכנסות שנסגרו</h3>
        <ul className="mt-4 flex flex-col gap-3">
          {perAgent.map(({ m, won, count }) => (
            <li key={m.id} className="flex items-center gap-3">
              <Avatar member={m} />
              <span className="w-28 shrink-0 truncate text-sm text-zinc-300">{m.name}</span>
              <div className="h-2 flex-1 rounded-full bg-white/5"><div className="h-full rounded-full bg-emerald-400/70" style={{ width: `${(won / agentMax) * 100}%` }} /></div>
              <span className="w-24 shrink-0 text-start text-sm tabular-nums text-zinc-200">{ils(won)}</span>
              <span className="hidden w-16 shrink-0 text-[11px] text-zinc-500 sm:block">{count} לידים</span>
            </li>
          ))}
        </ul>
      </Glass>
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
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <div className="flex flex-col gap-4 xl:col-span-2">
        {canManage && <Glass className="p-5">
          <div className="flex items-center gap-2"><UserPlus size={16} className="text-indigo-300" /><h3 className="text-sm font-semibold text-zinc-200">הזמנת חבר צוות</h3></div>
          <p className="mt-1 text-xs text-zinc-500">ההזמנה תישלח במייל ותהיה בתוקף 7 ימים. המשתמש יצורף רק לארגון <span dir="ltr">{org.name}</span>.</p>
          <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Mail size={15} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input id="invite-email" dir="ltr" type="email" placeholder="name@company.co.il" value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} pe-9`} aria-label="אימייל להזמנה" />
            </div>
            <div className="flex rounded-lg border border-white/10 bg-zinc-950/60 p-0.5" role="radiogroup" aria-label="תפקיד">
              {["Agent", "Admin", "Viewer"].map((r) => (
                <button key={r} type="button" role="radio" aria-checked={role === r} onClick={() => setRole(r)}
                  className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${role === r ? "bg-white/10 text-zinc-50" : "text-zinc-500 hover:text-zinc-300"}`}>{r}</button>
              ))}
            </div>
            <Btn type="submit" disabled={!valid}><Send size={15} />שליחת הזמנה</Btn>
          </form>
        </Glass>}
        <Glass className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
            <h3 className="text-sm font-semibold text-zinc-200">חברי הארגון</h3>
            <span className="text-xs text-zinc-500 tabular-nums">{org.members.length} משתמשים</span>
          </div>
          <ul className="divide-y divide-white/5">
            {org.members.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <Avatar member={m} size="h-9 w-9 text-xs" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                    {m.name}
                    {m.status === "pending" && <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 text-[10px] text-amber-300">ממתין לאישור</span>}
                  </div>
                  <div className="truncate text-xs text-zinc-500" dir="ltr" style={{ textAlign: "right" }}>{m.email}</div>
                </div>
                {m.role === "Owner" || !canManage || m.id === meId ? <RoleBadge role={m.role} /> : (
                  <select id={`role-${m.id}`} aria-label={`תפקיד של ${m.name}`} value={m.role} onChange={(e) => onRole(m.id, e.target.value)}
                    className="rounded-md border border-white/10 bg-zinc-950/60 px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-400/30">
                    <option>Admin</option><option>Agent</option><option>Viewer</option>
                  </select>
                )}
                {m.role !== "Owner" && canManage && m.id !== meId && (
                  <button onClick={() => onRemove(m.id)} aria-label={`הסרת ${m.name}`} className="rounded-md p-1.5 text-zinc-500 hover:bg-rose-500/10 hover:text-rose-300"><Trash2 size={15} /></button>
                )}
              </li>
            ))}
          </ul>
        </Glass>
      </div>
      <Glass className="h-fit p-5">
        <div className="flex items-center gap-2"><ShieldCheck size={16} className="text-emerald-300" /><h3 className="text-sm font-semibold text-zinc-200">מטריצת הרשאות</h3></div>
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-[11px] text-zinc-500"><th className="pb-2 text-start font-medium">יכולת</th><th className="pb-2 font-medium">Admin</th><th className="pb-2 font-medium">Agent</th><th className="pb-2 font-medium">Viewer</th></tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {PERMS.map((p) => (
              <tr key={p.label}>
                <td className="py-2.5 pe-2 text-xs text-zinc-300">{p.label}</td>
                {[p.admin, p.agent, p.viewer].map((ok, i) => (
                  <td key={i} className="py-2.5 text-center">{ok ? <Check size={15} className="mx-auto text-emerald-400" /> : <X size={15} className="mx-auto text-zinc-700" />}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </Glass>
    </div>
  );
}

/* ---------------------------------- settings ---------------------------------- */

function OrgSettings({ org, onSave, canManage }) {
  const [d, setD] = useState({ name: org.name, domain: org.domain });
  return (
    <div className="grid max-w-3xl grid-cols-1 gap-4">
      <Glass className="p-5">
        <h3 className="text-sm font-semibold text-zinc-200">פרטי הארגון</h3>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="שם הארגון"><input id="org-name" dir="ltr" className={inputCls} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></Field>
          <Field label="דומיין"><input id="org-domain" dir="ltr" className={inputCls} value={d.domain} onChange={(e) => setD({ ...d, domain: e.target.value })} /></Field>
          <Field label="מזהה Tenant"><input id="org-id" dir="ltr" readOnly className={`${inputCls} text-zinc-500`} value={org.id} /></Field>
          <Field label="מטבע ואזור זמן"><input id="org-locale" readOnly className={`${inputCls} text-zinc-500`} value="₪ ILS · Asia/Jerusalem" /></Field>
        </div>
        {canManage && <div className="mt-5 flex justify-end"><Btn onClick={() => onSave(d)} disabled={!d.name.trim()}><Check size={15} />שמירה</Btn></div>}
      </Glass>
      <Glass className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">תוכנית {org.plan}</h3>
          <p className="text-xs text-zinc-500">{org.members.filter((m) => m.status === "active").length} מתוך {org.plan === "Business" ? 50 : org.plan === "Pro" ? 15 : 3} מושבים בשימוש</p>
        </div>
        <Btn variant="ghost"><Sparkles size={15} />שדרוג תוכנית</Btn>
      </Glass>
    </div>
  );
}

/* ------------------------------ cookie / a11y banner ----------------------------- */

function ConsentBanner({ onClose, a11y, setA11y }) {
  const [panel, setPanel] = useState(false);
  const toggle = (k) => setA11y({ ...a11y, [k]: !a11y[k] });
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4">
      <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-zinc-900/95 p-4 shadow-2xl shadow-black/60 backdrop-blur-xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Cookie size={22} className="shrink-0 text-amber-300" />
          <p className="flex-1 text-sm leading-relaxed text-zinc-300">
            אנו משתמשים בעוגיות חיוניות להפעלת המערכת ובעוגיות אנליטיקה לשיפור השירות, בהתאם ל<a href="#privacy" className="text-indigo-300 underline-offset-2 hover:underline">מדיניות הפרטיות</a>. האתר מונגש לפי תקן ישראלי 5568 (WCAG 2.1 AA).
          </p>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Btn variant="ghost" onClick={() => setPanel((p) => !p)} aria-expanded={panel}><Accessibility size={15} />נגישות</Btn>
            <Btn variant="ghost" onClick={onClose}>חיוניות בלבד</Btn>
            <Btn onClick={onClose}>אישור הכול</Btn>
          </div>
        </div>
        {panel && (
          <div className="mt-4 grid grid-cols-1 gap-2 border-t border-white/10 pt-4 sm:grid-cols-3">
            {[
              { k: "large", icon: Type, label: "הגדלת טקסט" },
              { k: "contrast", icon: Contrast, label: "ניגודיות גבוהה" },
              { k: "calm", icon: Activity, label: "עצירת אנימציות" },
            ].map(({ k, icon: I, label }) => (
              <button key={k} onClick={() => toggle(k)} aria-pressed={a11y[k]}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition ${a11y[k] ? "border-indigo-400/40 bg-indigo-500/10 text-indigo-200" : "border-white/10 text-zinc-300 hover:bg-white/5"}`}>
                <I size={16} />{label}{a11y[k] && <Check size={14} className="ms-auto" />}
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
  { id: "analytics", label: "אנליטיקה", icon: ChartColumn },
  { id: "team", label: "ניהול צוות", icon: Users },
  { id: "settings", label: "הגדרות ארגון", icon: Settings },
];
const TITLES = {
  dashboard: ["דשבורד", "תמונת מצב של הארגון"],
  kanban: ["קנבאן לידים", "גררו כרטיסיות בין השלבים לעדכון סטטוס"],
  analytics: ["אנליטיקה", "מגמות הכנסה, מקורות וביצועי צוות"],
  team: ["ניהול צוות והרשאות", "הזמנת משתמשים והגדרת תפקידי Admin / Agent / Viewer"],
  settings: ["הגדרות ארגון", "פרטי ה-Tenant, תוכנית וחיוב"],
};

const ORG_KEY = "pulse:last-org";
const readLastOrg = () => { try { return localStorage.getItem(ORG_KEY); } catch { return null; } };
const writeLastOrg = (id) => { try { localStorage.setItem(ORG_KEY, id); } catch {} };

export default function PulseCRM({ initialOrgs, userId }) {
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
  const toastTimer = useRef(null);

  // Restore the last active org after hydration
  useEffect(() => {
    const last = readLastOrg();
    if (last && last !== orgId && initialOrgs.some((o) => o.id === last)) setOrgId(last); // eslint-disable-line react-hooks/set-state-in-effect
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const org = orgs.find((o) => o.id === orgId) ?? orgs[0];
  const me = org.members.find((m) => m.id === userId) ?? { id: userId, name: "אני", email: "", role: org.myRole, status: "active", color: 0 };
  const isAdmin = org.myRole === "Owner" || org.myRole === "Admin";
  const canEdit = org.myRole !== "Viewer";
  const notify = (msg) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(null), 2600); };
  const patchOrg = (fn) => setOrgs((all) => all.map((o) => (o.id === org.id ? fn(o) : o)));
  const fail = (error, msg = "הפעולה נכשלה") => { console.error(error); notify(error?.code === "42501" || error?.code === "PGRST116" ? "אין לך הרשאה לפעולה הזו" : msg); };

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
    notify(`${l.name} הועבר ל״${STAGES.find((s) => s.id === stage).label}״`);
  };
  const saveLead = async (d) => {
    const exists = org.leads.some((l) => l.id === d.id);
    const { data, error } = exists
      ? await db.from("leads").update(toRow(d)).eq("id", d.id).select().single()
      : await db.from("leads").insert({ ...toRow(d), id: d.id, org_id: org.id }).select().single();
    if (error) return fail(error, "שמירת הליד נכשלה");
    const saved = { ...d, created: data.created_at.slice(0, 10) };
    patchOrg((o) => ({ ...o, leads: exists ? o.leads.map((l) => (l.id === d.id ? saved : l)) : [saved, ...o.leads] }));
    setLead(null);
    notify(exists ? "הליד עודכן" : "ליד חדש נוסף ללוח");
  };
  const deleteLead = async (id) => {
    const { error } = await db.from("leads").delete().eq("id", id).select("id").single();
    if (error) return fail(error, "מחיקת הליד נכשלה");
    patchOrg((o) => ({ ...o, leads: o.leads.filter((l) => l.id !== id) }));
    setLead(null);
    notify("הליד נמחק");
  };
  const newLead = () => setLead({ id: crypto.randomUUID(), name: "", contact: "", phone: "", email: "", value: 0, stage: "new", owner: userId, tags: [], source: "ידני", created: today(), note: "" });

  const invite = async (email, role) => {
    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId: org.id, email, role: ROLE_TO_DB[role] }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { notify(res.status === 403 ? "לא ניתן ליצור הזמנה (ייתכן שכבר קיימת הזמנה פתוחה)" : "שליחת ההזמנה נכשלה"); return false; }
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
    const created = { id: data.id, name: data.name, plan: data.plan, domain: "", color: "from-emerald-500 to-teal-500", myRole: "Owner", members: [{ ...me, role: "Owner", color: 0 }], leads: [] };
    setOrgs((all) => [...all, created]);
    setOrgId(created.id); writeLastOrg(created.id); setNewOrgOpen(false); setNewOrgName(""); setPage("dashboard");
    notify(`הארגון ${name} נוצר`);
  };
  const saveOrg = async (d) => {
    const { error } = await db.from("organizations").update({ name: d.name.trim(), domain: d.domain || null }).eq("id", org.id).select("id").single();
    if (error) return fail(error, "שמירת ההגדרות נכשלה");
    patchOrg((o) => ({ ...o, ...d }));
    notify("הגדרות הארגון נשמרו");
  };
  const signOut = async () => { await db.auth.signOut(); router.replace("/login"); router.refresh(); };

  const [title, subtitle] = TITLES[page];
  const rootCls = [
    "min-h-screen bg-zinc-950 text-zinc-100 antialiased selection:bg-indigo-500/30",
    a11y.large ? "text-[17px] [&_.text-xs]:text-sm [&_.text-sm]:text-base" : "",
    a11y.contrast ? "contrast-125 [&_.text-zinc-500]:text-zinc-300 [&_.text-zinc-400]:text-zinc-200" : "",
    a11y.calm ? "[&_*]:!transition-none [&_*]:!animate-none" : "",
  ].join(" ");

  const Sidebar = (
    <aside className="flex h-full w-64 flex-col gap-4 border-s border-white/10 bg-zinc-950/80 p-3 backdrop-blur-xl">
      <div className="flex items-center gap-2 px-2 pt-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-400 to-sky-400"><Activity size={16} className="text-zinc-950" strokeWidth={2.5} /></span>
        <span className="text-[15px] font-bold tracking-tight">Pulse CRM</span>
        <span className="ms-auto rounded border border-white/10 px-1.5 text-[10px] text-zinc-500">by Nitzanet</span>
      </div>
      <OrgSwitcher orgs={orgs} current={org} onSwitch={switchOrg} onCreate={() => setNewOrgOpen(true)} />
      <nav className="flex flex-col gap-0.5" aria-label="ניווט ראשי">
        {NAV.map((n) => (
          <button key={n.id} onClick={() => { setPage(n.id); setNavOpen(false); }} aria-current={page === n.id ? "page" : undefined}
            className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${page === n.id ? "bg-white/[0.08] font-medium text-zinc-50" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"}`}>
            <n.icon size={17} />{n.label}
            {n.id === "kanban" && <span className="ms-auto rounded bg-white/5 px-1.5 text-[11px] tabular-nums text-zinc-500">{org.leads.filter(isOpen).length}</span>}
          </button>
        ))}
      </nav>
      <div className="mt-auto flex items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
        <Avatar member={me} size="h-8 w-8 text-xs" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{me.name}</div>
          <div className="text-[11px] text-zinc-500">{me.role}</div>
        </div>
        <button onClick={signOut} aria-label="התנתקות" className="rounded-md p-1.5 text-zinc-500 hover:bg-white/5 hover:text-zinc-200"><LogOut size={15} /></button>
      </div>
    </aside>
  );

  return (
    <div dir="rtl" lang="he" className={rootCls} style={{ fontFamily: "'Assistant', system-ui, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Assistant:wght@300;400;500;600;700;800&display=swap');`}</style>
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_60%_40%_at_70%_-10%,rgba(99,102,241,0.12),transparent),radial-gradient(ellipse_40%_30%_at_0%_100%,rgba(14,165,233,0.06),transparent)]" />

      <div className="relative flex min-h-screen">
        <div className="sticky top-0 hidden h-screen lg:block">{Sidebar}</div>
        {navOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden" onClick={() => setNavOpen(false)}>
            <div onClick={(e) => e.stopPropagation()}>{Sidebar}</div>
            <div className="flex-1 bg-black/60 backdrop-blur-sm" />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/10 bg-zinc-950/70 px-4 py-3 backdrop-blur-xl sm:px-6">
            <button className="rounded-md p-1.5 text-zinc-400 hover:bg-white/5 lg:hidden" onClick={() => setNavOpen(true)} aria-label="פתיחת תפריט"><Menu size={20} /></button>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold tracking-tight">{title}</h1>
              <p className="hidden truncate text-xs text-zinc-500 sm:block">{subtitle}</p>
            </div>
            <div className="relative hidden md:block">
              <Search size={15} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-zinc-600" />
              <input id="global-search" value={query} onChange={(e) => { setQuery(e.target.value); if (e.target.value && page !== "kanban") setPage("kanban"); }}
                placeholder="חיפוש לידים, תגיות..." className={`${inputCls} w-64 pe-9`} aria-label="חיפוש" />
            </div>
            <button className="relative rounded-lg border border-white/10 p-2 text-zinc-400 hover:bg-white/5" aria-label="התראות">
              <Bell size={16} /><span className="absolute end-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-indigo-400" />
            </button>
            {canEdit && <Btn onClick={newLead} className="hidden sm:inline-flex"><Plus size={15} />ליד חדש</Btn>}
          </header>

          <main className="flex-1 px-4 py-5 sm:px-6">
            <div className="mb-4 flex items-center gap-2 text-xs text-zinc-500">
              <Building2 size={13} /><span dir="ltr">{org.name}</span><span>/</span><span className="text-zinc-300">{title}</span>
              <span className="ms-auto flex items-center gap-1"><Clock size={12} /><RoleBadge role={org.myRole} /></span>
            </div>
            {page === "dashboard" && <Dashboard org={org} onOpen={setLead} go={setPage} />}
            {page === "kanban" && <Kanban org={org} onMove={moveLead} onOpen={setLead} onAdd={newLead} query={query} canEdit={canEdit} />}
            {page === "analytics" && <Analytics org={org} />}
            {page === "team" && <Team org={org} onInvite={invite} onRole={changeRole} onRemove={removeMember} notify={notify} canManage={isAdmin} meId={userId} />}
            {page === "settings" && <OrgSettings key={org.id} org={org} onSave={saveOrg} canManage={isAdmin} />}
          </main>

          <footer className={`border-t border-white/10 px-4 py-5 text-xs text-zinc-500 sm:px-6 ${banner ? "pb-48 sm:pb-32" : ""}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p>© 2026 ניצנט בע״מ · Pulse CRM. כל הזכויות שמורות. המידע במערכת מוגן ומבודד לכל ארגון בנפרד.</p>
              <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="קישורים משפטיים">
                <a href="#terms" className="hover:text-zinc-300">תנאי שימוש</a>
                <a href="#privacy" className="hover:text-zinc-300">מדיניות פרטיות</a>
                <a href="#accessibility" className="hover:text-zinc-300">הצהרת נגישות</a>
                <a href="#dpa" className="hover:text-zinc-300">הסכם עיבוד נתונים (DPA)</a>
                <button onClick={() => setBanner(true)} className="hover:text-zinc-300">הגדרות עוגיות</button>
              </nav>
            </div>
          </footer>
        </div>
      </div>

      <LeadModal key={lead?.id ?? "none"} lead={lead} org={org} onClose={() => setLead(null)} onSave={saveLead} onDelete={deleteLead} canEdit={canEdit} canDelete={isAdmin} />

      <Modal open={newOrgOpen} onClose={() => setNewOrgOpen(false)} title="הוספת עסק חדש">
        <p className="mb-4 text-sm text-zinc-400">כל עסק מקבל סביבה מבודדת עם לידים, צוות והגדרות משלו. תוכלו לעבור ביניהם מה-Sidebar.</p>
        <Field label="שם העסק"><input id="new-org-name" dir="ltr" autoFocus className={inputCls} placeholder="Acme Ltd." value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && createOrg()} /></Field>
        <div className="mt-5 flex justify-end gap-2">
          <Btn variant="ghost" onClick={() => setNewOrgOpen(false)}>ביטול</Btn>
          <Btn onClick={createOrg} disabled={!newOrgName.trim()}><Plus size={15} />יצירת ארגון</Btn>
        </div>
      </Modal>

      {banner && <ConsentBanner onClose={() => setBanner(false)} a11y={a11y} setA11y={setA11y} />}

      {toast && (
        <div role="status" className="fixed left-1/2 top-4 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/95 px-4 py-2.5 text-sm text-zinc-100 shadow-xl backdrop-blur-xl">
          <Check size={15} className="text-emerald-400" />{toast}
        </div>
      )}
    </div>
  );
}
