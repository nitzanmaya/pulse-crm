"use client";

import React, { useState } from "react";
import { MessagesSquare, FileText, PlugZap, Bot, Info } from "lucide-react";
import { Card, SectionTitle } from "@/components/ui";
import LiveChat from "@/components/bot/LiveChat";
import BotContentEditor from "@/components/bot/BotContentEditor";
import BotConnection from "@/components/bot/BotConnection";
import WhatsAppSimulator from "@/components/booking/WhatsAppSimulator";

const TAB = {
  live: { id: "live", label: "שיחות חיות", icon: MessagesSquare },
  content: { id: "content", label: "תוכן הבוט", icon: FileText, admin: true },
  connect: { id: "connect", label: "הפעלה וחיבור", icon: PlugZap, admin: true },
  simulator: { id: "simulator", label: "סימולטור", icon: Bot },
};

export default function BotAdminPage(props) {
  const { org, db, isAdmin, providers } = props;
  const s = org.bot.settings;
  const live = s?.is_enabled && s?.whatsapp_phone_number_id && providers.webhook;
  // Until the bot is connected, setup comes first and there are no chats to show
  const tabs = (live ? [TAB.live, TAB.content, TAB.simulator, TAB.connect] : [TAB.connect, TAB.content, TAB.simulator]).filter((t) => !t.admin || isAdmin);
  const [tab, setTab] = useState(tabs[0]?.id ?? "simulator");

  return (
    <div className="flex flex-col gap-5">
      {!live && (
        <div className="flex animate-fade-up items-start gap-3 rounded-2xl bg-sky-50 px-4 py-3.5 text-[15px] text-slate-700 ring-1 ring-sky-100">
          <Info size={19} className="mt-0.5 shrink-0 text-sky-500" />
          <span>הבוט עוד לא מחובר ל-WhatsApp, וזה בסדר: היומן, דף ההזמנה והתזכורות במייל עובדים גם בלעדיו. כאן מגדירים את הבוט כשתרצו להפעיל אותו.</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200/80" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-[15px] font-semibold transition duration-200 ${tab === t.id ? "bg-gradient-to-l from-rose-500 to-pink-500 text-white shadow-md shadow-rose-500/25" : "text-slate-600 hover:bg-rose-50 hover:text-rose-700"}`}>
              <t.icon size={17} />{t.label}
            </button>
          ))}
        </div>
        <span className={`ms-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${live ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
          <span className={`h-2 w-2 rounded-full ${live ? "animate-heartbeat bg-emerald-500" : "bg-slate-400"}`} />
          {live ? <>הבוט פעיל{s.whatsapp_display_phone && <> · <bdi dir="ltr">{s.whatsapp_display_phone}</bdi></>}</> : s?.is_enabled ? "ממתין לחיבור WhatsApp" : "הבוט כבוי"}
        </span>
      </div>

      {tab === "live" && <LiveChat key={org.id} {...props} onSimulate={() => setTab("simulator")} />}
      {tab === "content" && <BotContentEditor key={org.id} {...props} />}
      {tab === "connect" && <BotConnection key={org.id} {...props} />}
      {tab === "simulator" && (
        <Card className="animate-fade-up p-5 sm:p-6">
          <SectionTitle icon={Bot} color="text-emerald-500">סימולטור הבוט</SectionTitle>
          <p className="mb-5 mt-1 text-sm text-slate-500">שיחה מלאה עם התפריט, השאלות הנפוצות והנוסחים השמורים, ועם שעות פנויות אמיתיות. לא נשלחות הודעות ולא נוצרים תורים.</p>
          <WhatsAppSimulator key={org.id} org={org} db={db} />
        </Card>
      )}
    </div>
  );
}
