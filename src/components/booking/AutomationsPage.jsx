"use client";

import React, { useRef, useState } from "react";
import { Zap, MessageCircle, Mail, CalendarCheck, BellRing, Check, Plus, Clock, Server, Braces, Inbox, CircleAlert, CheckCheck } from "lucide-react";
import { Card, Btn, Field, inputCls, SectionTitle } from "@/components/ui";
import { JobChip } from "@/components/booking/CalendarPage";
import { DEFAULT_TEMPLATES, TEMPLATE_VARS, renderTemplate, fmtTime, fmtDate } from "@/lib/booking/shared";

const META = {
  booking_confirm_whatsapp: { channel: "whatsapp", kind: "confirmation", title: "אישור הזמנה ב-WhatsApp" },
  booking_confirm_email: { channel: "email", kind: "confirmation", title: "אישור הזמנה במייל" },
  booking_reminder_whatsapp: { channel: "whatsapp", kind: "reminder", title: "תזכורת ב-WhatsApp לפני הביקור" },
  booking_reminder_email: { channel: "email", kind: "reminder", title: "תזכורת במייל לפני הביקור" },
};
const ORDER = Object.keys(META);
const OFFSETS = [2, 3, 6, 12, 24, 48];

const SAMPLE = (org) => ({ name: "דנה", service: org.services[0]?.name ?? "ניקוי מזגן", date: "יום שלישי, 7.10", time: "10:30", address: "הרצל 12, רמת גן", business: org.name });

function StatusPill({ ok, warn, children }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${ok ? "bg-emerald-50 text-emerald-700" : warn ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
      <span className={`h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : warn ? "bg-amber-500" : "bg-slate-400"} ${ok ? "animate-heartbeat" : ""}`} />{children}
    </span>
  );
}

function FlowDiagram({ automations }) {
  const on = (k) => automations.find((a) => a.key === k)?.is_active;
  const reminder = automations.find((a) => a.key === "booking_reminder_whatsapp");
  const nodes = [
    { icon: CalendarCheck, title: "תור נקבע", text: "דף הזמנה, בוט או ידני", tone: "from-rose-500 to-pink-500", active: true },
    { icon: Zap, title: "אישור מיידי", text: [on("booking_confirm_whatsapp") && "WhatsApp", on("booking_confirm_email") && "מייל"].filter(Boolean).join(" + ") || "כבוי", tone: "from-violet-500 to-indigo-500", active: on("booking_confirm_whatsapp") || on("booking_confirm_email") },
    { icon: BellRing, title: `תזכורת ${reminder?.config?.offset_hours ?? 24} שעות לפני`, text: [on("booking_reminder_whatsapp") && "WhatsApp", on("booking_reminder_email") && "מייל"].filter(Boolean).join(" + ") || "כבויה", tone: "from-sky-500 to-cyan-500", active: on("booking_reminder_whatsapp") || on("booking_reminder_email") },
    { icon: CheckCheck, title: "הביקור", text: "סימון ״בוצע״ מעדכן את כרטיס הלקוח", tone: "from-emerald-500 to-teal-500", active: true },
  ];
  return (
    <Card className="relative animate-fade-up overflow-hidden bg-gradient-to-l from-rose-50 via-white to-violet-50 p-6">
      <SectionTitle icon={Zap}>מה קורה כשנקבע תור</SectionTitle>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start">
        {nodes.map((n, i) => (
          <React.Fragment key={n.title}>
            {i > 0 && <span aria-hidden className="mt-7 hidden h-0.5 min-w-6 flex-[0.4] animate-shimmer bg-[repeating-linear-gradient(90deg,#fda4af_0_8px,transparent_8px_14px)] bg-[length:28px_2px] sm:block" />}
            <div className="flex flex-1 items-center gap-3 sm:flex-col sm:text-center">
              <span className={`flex h-14 w-14 shrink-0 animate-pop-in items-center justify-center rounded-2xl bg-gradient-to-br ${n.tone} text-white shadow-lg transition duration-300 hover:-rotate-6 hover:scale-110 ${n.active ? "" : "opacity-40 grayscale"}`} style={{ animationDelay: `${i * 120}ms` }}>
                <n.icon size={24} />
              </span>
              <span>
                <span className="block text-[15px] font-bold text-slate-800">{n.title}</span>
                <span className="block text-sm text-slate-500">{n.text}</span>
              </span>
            </div>
          </React.Fragment>
        ))}
      </div>
    </Card>
  );
}

function AutomationCard({ a, org, db, isAdmin, notify, fail, patchOrg, delay }) {
  const meta = META[a.key];
  const [tpl, setTpl] = useState(a.config?.template ?? DEFAULT_TEMPLATES[`${meta.channel}_${meta.kind}`]);
  const [subject, setSubject] = useState(a.config?.subject ?? DEFAULT_TEMPLATES[`email_${meta.kind}_subject`] ?? "");
  const [offset, setOffset] = useState(Number(a.config?.offset_hours ?? 24));
  const [busy, setBusy] = useState(false);
  const area = useRef(null);
  const dirty = tpl !== (a.config?.template ?? DEFAULT_TEMPLATES[`${meta.channel}_${meta.kind}`]) || (meta.channel === "email" && subject !== (a.config?.subject ?? DEFAULT_TEMPLATES[`email_${meta.kind}_subject`])) || (meta.kind === "reminder" && offset !== Number(a.config?.offset_hours ?? 24));
  const vars = SAMPLE(org);
  const wa = meta.channel === "whatsapp";

  const persist = async (patch, msg) => {
    setBusy(true);
    const { data, error } = await db.from("automations").update(patch).eq("id", a.id).select().single();
    setBusy(false);
    if (error) return fail(error, "שמירת האוטומציה נכשלה");
    patchOrg((o) => ({ ...o, automations: o.automations.map((x) => (x.id === data.id ? data : x)) }));
    notify(msg);
  };
  const save = () => persist({ config: { ...a.config, kind: meta.kind, template: tpl, ...(meta.channel === "email" ? { subject } : {}), ...(meta.kind === "reminder" ? { offset_hours: offset } : {}) } }, "האוטומציה נשמרה");
  const insertVar = (k) => {
    const el = area.current;
    const at = el?.selectionStart ?? tpl.length;
    const next = `${tpl.slice(0, at)}{{${k}}}${tpl.slice(el?.selectionEnd ?? at)}`;
    setTpl(next);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + k.length + 4, at + k.length + 4); });
  };

  return (
    <Card className={`flex animate-fade-up flex-col overflow-hidden transition duration-300 hover:shadow-xl ${a.is_active ? "" : "opacity-75"}`} style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-3 border-b border-slate-100 p-5">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-md ${wa ? "bg-gradient-to-br from-[#25d366] to-[#128c7e]" : "bg-gradient-to-br from-sky-400 to-indigo-500"}`}>
          {wa ? <MessageCircle size={21} /> : <Mail size={21} />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-slate-800">{meta.title}</h3>
          <p className="flex items-center gap-1 text-sm text-slate-500"><Clock size={13} />{meta.kind === "confirmation" ? "מיד כשנקבע תור" : `${offset} שעות לפני מועד הביקור`}</p>
        </div>
        <button type="button" role="switch" aria-checked={a.is_active} aria-label="הפעלה" disabled={!isAdmin || busy}
          onClick={() => persist({ is_active: !a.is_active }, a.is_active ? "האוטומציה הושבתה" : "האוטומציה הופעלה")}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 disabled:opacity-60 ${a.is_active ? "bg-gradient-to-l from-rose-500 to-pink-500" : "bg-slate-300"}`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all duration-300 ${a.is_active ? "start-6" : "start-1"}`} />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        {meta.kind === "reminder" && (
          <Field label="מתי לשלוח">
            <select className={inputCls} value={offset} onChange={(e) => setOffset(Number(e.target.value))} disabled={!isAdmin}>
              {OFFSETS.map((h) => <option key={h} value={h}>{h} שעות לפני הביקור</option>)}
            </select>
          </Field>
        )}
        {!wa && <Field label="נושא המייל"><input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} disabled={!isAdmin} /></Field>}
        <Field label="נוסח ההודעה">
          <textarea ref={area} rows={5} className={`${inputCls} leading-relaxed`} value={tpl} onChange={(e) => setTpl(e.target.value)} disabled={!isAdmin} />
        </Field>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Braces size={14} className="text-slate-400" />
            {TEMPLATE_VARS.map((v) => (
              <button key={v.key} type="button" onClick={() => insertVar(v.key)} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 active:scale-95">{v.label}</button>
            ))}
          </div>
        )}

        <div className={`mt-1 rounded-2xl p-3 ${wa ? "bg-[#efeae2]" : "bg-slate-50"}`}>
          <div className="mb-1.5 text-xs font-semibold text-slate-500">תצוגה מקדימה</div>
          {wa ? (
            <div className="max-w-[90%] rounded-xl rounded-ss-none bg-white px-3 py-2 text-[14px] leading-snug text-[#111b21] shadow-sm">
              <span className="whitespace-pre-line">{renderTemplate(tpl, vars)}</span>
              <span className="float-end ms-3 mt-1 text-[11px] text-[#667781]">09:00</span>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
              <div className="border-b border-slate-100 px-3 py-2 text-sm"><span className="text-slate-400">נושא: </span><span className="font-semibold text-slate-800">{renderTemplate(subject, vars)}</span></div>
              <div className="whitespace-pre-line px-3 py-2.5 text-sm leading-relaxed text-slate-700">{renderTemplate(tpl, vars)}</div>
            </div>
          )}
        </div>
        {isAdmin && dirty && <div className="flex justify-end"><Btn disabled={busy || !tpl.trim()} onClick={save} className="h-10 px-4 text-sm"><Check size={16} />שמירת שינויים</Btn></div>}
      </div>
    </Card>
  );
}

export default function AutomationsPage({ org, db, isAdmin, notify, fail, patchOrg, providers }) {
  const list = ORDER.map((k) => org.automations.find((a) => a.key === k)).filter(Boolean);
  const missing = ORDER.filter((k) => !org.automations.some((a) => a.key === k));
  const apptById = Object.fromEntries(org.appointments.map((a) => [a.id, a]));

  const addMissing = async (key) => {
    const meta = META[key];
    const { data, error } = await db.from("automations").insert({
      org_id: org.id, key, name: meta.title, trigger_event: "appointment_booked",
      action_type: meta.channel === "whatsapp" ? "send_whatsapp" : "send_email",
      config: { kind: meta.kind, template: DEFAULT_TEMPLATES[`${meta.channel}_${meta.kind}`], ...(meta.channel === "email" ? { subject: DEFAULT_TEMPLATES[`email_${meta.kind}_subject`] } : {}), ...(meta.kind === "reminder" ? { offset_hours: 24 } : {}) },
      is_active: true,
    }).select().single();
    if (error) return fail(error, "הוספת האוטומציה נכשלה");
    patchOrg((o) => ({ ...o, automations: [...o.automations, data] }));
    notify(`${meta.title} נוספה`);
  };

  return (
    <div className="flex flex-col gap-5">
      <>
          <FlowDiagram automations={org.automations} />

          <Card className="flex animate-fade-up flex-wrap items-center gap-3 p-4" style={{ animationDelay: "60ms" }}>
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-700"><Server size={16} className="text-slate-400" />ערוצי שליחה</span>
            <StatusPill ok={providers.whatsapp === "meta"} warn={providers.whatsapp !== "meta"}>WhatsApp: {providers.whatsapp === "meta" ? "מחובר (Cloud API)" : "מצב הדגמה, לא נשלח ללקוחות"}</StatusPill>
            <StatusPill ok={providers.email} warn={!providers.email}>מייל: {providers.email ? "פעיל דרך Resend" : "חסר מפתח Resend"}</StatusPill>
            <StatusPill ok={providers.cron} warn={!providers.cron}>תזכורות מתוזמנות: {providers.cron ? "פעיל" : "ממתין ל-CRON_SECRET"}</StatusPill>
          </Card>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {list.map((a, i) => <AutomationCard key={a.id} a={a} org={org} db={db} isAdmin={isAdmin} notify={notify} fail={fail} patchOrg={patchOrg} delay={i * 60} />)}
            {isAdmin && missing.map((k) => (
              <button key={k} onClick={() => addMissing(k)} className="group flex min-h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-rose-200 bg-white/60 p-6 text-[15px] font-semibold text-rose-500 transition hover:border-rose-300 hover:bg-white hover:text-rose-600">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 transition group-hover:scale-110"><Plus size={24} /></span>
                הוספת {META[k].title}
              </button>
            ))}
          </div>

          <Card className="animate-fade-up overflow-hidden" style={{ animationDelay: "120ms" }}>
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-800"><Inbox size={18} className="text-violet-500" />יומן שליחות אחרון</h3>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-medium text-slate-600 tabular-nums">{org.jobs.length}</span>
            </div>
            {org.jobs.length === 0 && <p className="px-6 py-5 text-sm text-slate-500">עוד לא נשלחו הודעות. כשייקבע התור הראשון, האישורים והתזכורות יופיעו כאן.</p>}
            <ul className="divide-y divide-slate-100">
              {org.jobs.slice(0, 15).map((j) => {
                const ap = apptById[j.appointment_id];
                return (
                  <li key={j.id} className="flex flex-wrap items-center gap-3 px-6 py-3 transition hover:bg-slate-50/70">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-slate-800">{ap?.customer_name ?? "תור"}</span>
                      <span className="block text-xs text-slate-500">{ap ? `תור ב${fmtDate(ap.starts_at, { weekday: "long", day: "numeric", month: "numeric" })} ${fmtTime(ap.starts_at)}` : ""}</span>
                    </span>
                    {j.status === "failed" && j.error && <span className="flex items-center gap-1 text-xs text-red-600"><CircleAlert size={13} />{j.error.slice(0, 60)}</span>}
                    <JobChip job={j} />
                  </li>
                );
              })}
            </ul>
          </Card>
      </>
    </div>
  );
}
