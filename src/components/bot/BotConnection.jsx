"use client";

import React, { useState } from "react";
import { Webhook, Smartphone, KeyRound, Copy, Check, Power, Headset, Undo2, CircleCheck, CircleDashed, ShieldCheck } from "lucide-react";
import { Card, Btn, Field, inputCls, SectionTitle, Toggle } from "@/components/ui";

const parseList = (s) => [...new Set(s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean))].slice(0, 30);

function EnvRow({ ok, name, text }) {
  return (
    <li className="flex items-start gap-2.5">
      {ok ? <CircleCheck size={18} className="mt-0.5 shrink-0 text-emerald-500" /> : <CircleDashed size={18} className="mt-0.5 shrink-0 text-amber-500" />}
      <span className="min-w-0">
        <code dir="ltr" className="rounded bg-slate-100 px-1.5 py-0.5 text-[13px] font-semibold text-slate-700">{name}</code>
        <span className="block text-sm text-slate-500">{text}</span>
      </span>
    </li>
  );
}

export default function BotConnection({ org, db, isAdmin, notify, fail, patchOrg, providers, siteUrl }) {
  const s = org.bot.settings ?? { is_enabled: false, whatsapp_phone_number_id: null, whatsapp_display_phone: null, handoff_keywords: [], restart_keywords: [] };
  const [d, setD] = useState({
    phoneId: s.whatsapp_phone_number_id ?? "",
    display: s.whatsapp_display_phone ?? "",
    handoff: s.handoff_keywords.join(", "),
    restart: s.restart_keywords.join(", "),
  });
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const webhookUrl = `${siteUrl.replace(/\/$/, "")}/api/whatsapp/webhook`;
  const phoneValid = !d.phoneId || /^[0-9]{5,32}$/.test(d.phoneId.trim());
  const dirty = d.phoneId !== (s.whatsapp_phone_number_id ?? "") || d.display !== (s.whatsapp_display_phone ?? "") || d.handoff !== s.handoff_keywords.join(", ") || d.restart !== s.restart_keywords.join(", ");

  const persist = async (patch, msg) => {
    setBusy(true);
    const { data, error } = await db.from("bot_settings").upsert({ org_id: org.id, ...patch }, { onConflict: "org_id" }).select().single();
    setBusy(false);
    if (error) return fail(error, error.code === "23505" ? "המספר הזה כבר מחובר לארגון אחר" : "שמירת ההגדרות נכשלה");
    patchOrg((o) => ({ ...o, bot: { ...o.bot, settings: data } }));
    notify(msg);
  };
  const save = () => persist({
    whatsapp_phone_number_id: d.phoneId.trim() || null,
    whatsapp_display_phone: d.display.trim() || null,
    handoff_keywords: parseList(d.handoff),
    restart_keywords: parseList(d.restart),
  }, "הגדרות החיבור נשמרו");
  const copy = async () => { try { await navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { notify("לא ניתן להעתיק", "error"); } };

  const live = s.is_enabled && s.whatsapp_phone_number_id && providers.webhook;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <div className="flex flex-col gap-5">
        <Card className={`relative animate-fade-up overflow-hidden p-6 ${live ? "bg-gradient-to-l from-emerald-50 via-white to-white" : ""}`}>
          <SectionTitle icon={Power} color={live ? "text-emerald-500" : "text-slate-400"}>הבוט עונה ללקוחות</SectionTitle>
          <div className="mt-4">
            <Toggle checked={s.is_enabled} disabled={!isAdmin || busy} onChange={(v) => persist({ is_enabled: v }, v ? "הבוט הופעל" : "הבוט כובה. ההודעות עדיין נשמרות בשיחות החיות")}
              icon={Power} title={s.is_enabled ? "הבוט פעיל" : "הבוט כבוי"}
              text={s.is_enabled ? (live ? "עונה עכשיו להודעות במספר העסקי" : "יתחיל לענות כשהחיבור ל-WhatsApp יושלם") : "הודעות נכנסות נשמרות, בלי תשובה אוטומטית"} />
          </div>
        </Card>

        <Card className="animate-fade-up p-6" style={{ animationDelay: "60ms" }}>
          <SectionTitle icon={Smartphone} color="text-emerald-500">המספר העסקי</SectionTitle>
          <div className="mt-4 flex flex-col gap-4">
            <Field label="Phone Number ID (מ-Meta, WhatsApp → API Setup)">
              <input dir="ltr" inputMode="numeric" className={`${inputCls} text-start ${phoneValid ? "" : "border-red-300 ring-4 ring-red-50"}`} value={d.phoneId} disabled={!isAdmin} onChange={(e) => setD({ ...d, phoneId: e.target.value.replace(/\s/g, "") })} placeholder="123456789012345" />
            </Field>
            <Field label="המספר כפי שהלקוחות רואים אותו (לתצוגה בלבד)">
              <input dir="ltr" className={`${inputCls} text-start`} value={d.display} disabled={!isAdmin} maxLength={32} onChange={(e) => setD({ ...d, display: e.target.value })} placeholder="+972 50-123-4567" />
            </Field>
            <Field label="מילים שמעבירות לנציג">
              <div className="relative">
                <Headset size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className={`${inputCls} ps-10`} value={d.handoff} disabled={!isAdmin} onChange={(e) => setD({ ...d, handoff: e.target.value })} />
              </div>
            </Field>
            <Field label="מילים שמחזירות לתפריט">
              <div className="relative">
                <Undo2 size={16} className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className={`${inputCls} ps-10`} value={d.restart} disabled={!isAdmin} onChange={(e) => setD({ ...d, restart: e.target.value })} />
              </div>
            </Field>
            {isAdmin && dirty && <div className="flex justify-end"><Btn onClick={save} disabled={busy || !phoneValid}><Check size={17} />שמירה</Btn></div>}
          </div>
        </Card>
      </div>

      <div className="flex flex-col gap-5">
        <Card className="animate-fade-up p-6" style={{ animationDelay: "90ms" }}>
          <SectionTitle icon={Webhook} color="text-violet-500">הגדרת Webhook ב-Meta</SectionTitle>
          <p className="mt-1 text-sm text-slate-500">באפליקציה ב-developers.facebook.com: WhatsApp → Configuration → Webhook.</p>
          <div className="mt-4 flex flex-col gap-3">
            <Field label="Callback URL">
              <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2 ps-4">
                <span dir="ltr" className="min-w-0 flex-1 truncate text-start text-[15px] font-medium text-slate-700">{webhookUrl}</span>
                <button onClick={copy} aria-label="העתקה" className="rounded-xl bg-white p-2.5 text-slate-500 shadow-sm transition hover:text-rose-600 active:scale-90">{copied ? <Check size={17} className="text-emerald-500" /> : <Copy size={17} />}</button>
              </div>
            </Field>
            <div className="flex items-start gap-2 rounded-xl bg-violet-50/60 px-3.5 py-3 text-sm text-slate-600">
              <KeyRound size={16} className="mt-0.5 shrink-0 text-violet-500" />
              <span>ב-Verify token מדביקים את אותו ערך ששמתם ב-<code dir="ltr" className="font-semibold">WHATSAPP_VERIFY_TOKEN</code> ב-Vercel, ובשדה Webhook fields מסמנים את <code dir="ltr" className="font-semibold">messages</code>.</span>
            </div>
          </div>
        </Card>

        <Card className="animate-fade-up p-6" style={{ animationDelay: "120ms" }}>
          <SectionTitle icon={ShieldCheck} color="text-sky-500">משתני סביבה ב-Vercel</SectionTitle>
          <ul className="mt-4 flex flex-col gap-3">
            <EnvRow ok={providers.whatsapp === "meta"} name="WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID" text="טוקן קבוע של System User באפליקציית Meta (הרשאת whatsapp_business_messaging), ומזהה המספר שממנו נשלחות התזכורות" />
            <EnvRow ok={providers.appSecret} name="WHATSAPP_APP_SECRET" text="App Secret מהגדרות האפליקציה, לאימות שההודעות באמת מ-Meta" />
            <EnvRow ok={providers.verifyToken} name="WHATSAPP_VERIFY_TOKEN" text="מחרוזת שאתם בוחרים, לאימות הראשוני של ה-Webhook" />
            <EnvRow ok={providers.cron} name="CRON_SECRET" text="אותו סוד של התזכורות. הבוט משתמש בו כדי לגשת למסד הנתונים" />
          </ul>
        </Card>
      </div>
    </div>
  );
}
