"use client";

import React, { useState } from "react";
import { MessagesSquare, FileText, CalendarCog, PlugZap, Bot } from "lucide-react";
import { Card, SectionTitle } from "@/components/ui";
import LiveChat from "@/components/bot/LiveChat";
import BotContentEditor from "@/components/bot/BotContentEditor";
import BotConnection from "@/components/bot/BotConnection";
import WhatsAppSimulator from "@/components/booking/WhatsAppSimulator";
import { AvailabilityTab, GoogleCalendarCard } from "@/components/booking/CalendarPage";

const TABS = [
  { id: "live", label: "שיחות חיות", icon: MessagesSquare },
  { id: "content", label: "תוכן הבוט", icon: FileText, admin: true },
  { id: "calendar", label: "הגדרות יומן", icon: CalendarCog, admin: true },
  { id: "connect", label: "חיבור WhatsApp", icon: PlugZap, admin: true },
  { id: "simulator", label: "סימולטור", icon: Bot },
];

export default function BotAdminPage(props) {
  const { org, db, isAdmin, providers, initialTab } = props;
  const tabs = TABS.filter((t) => !t.admin || isAdmin);
  const [tab, setTab] = useState(tabs.some((t) => t.id === initialTab) ? initialTab : "live");
  const s = org.bot.settings;
  const live = s?.is_enabled && s?.whatsapp_phone_number_id && providers.webhook;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200/80" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-[15px] font-semibold transition duration-200 ${tab === t.id ? "bg-gradient-to-l from-rose-500 to-pink-500 text-white shadow-md shadow-rose-500/25" : "text-slate-600 hover:bg-rose-50 hover:text-rose-700"}`}>
              <t.icon size={17} />{t.label}
            </button>
          ))}
        </div>
        <span className={`ms-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${live ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          <span className={`h-2 w-2 rounded-full ${live ? "animate-heartbeat bg-emerald-500" : "bg-amber-500"}`} />
          {live ? <>הבוט פעיל{s.whatsapp_display_phone && <> · <bdi dir="ltr">{s.whatsapp_display_phone}</bdi></>}</> : s?.is_enabled ? "ממתין לחיבור WhatsApp" : "הבוט כבוי"}
        </span>
      </div>

      {tab === "live" && <LiveChat key={org.id} {...props} onSimulate={() => setTab("simulator")} />}
      {tab === "content" && <BotContentEditor key={org.id} {...props} />}
      {tab === "calendar" && (
        <div className="flex flex-col gap-5">
          <AvailabilityTab key={org.id} {...props} />
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
            <GoogleCalendarCard {...props} />
            <Card className="h-fit animate-fade-up p-6 text-sm text-slate-600">
              <SectionTitle icon={CalendarCog} color="text-violet-500">אורך הפגישה</SectionTitle>
              <p className="mt-2 leading-relaxed">לכל שירות יש משך משלו (בלשונית ״יומן ותורים״ ← ״שירותים״), ושאלות כמות מאריכות אותו אוטומטית. הבוט ודף ההזמנה מציעים רק שעות שבהן כל המשך, כולל זמן המעבר, פנוי.</p>
            </Card>
          </div>
        </div>
      )}
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
