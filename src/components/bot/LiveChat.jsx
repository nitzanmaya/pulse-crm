"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Headset, Search, Send, Check, CheckCheck, Clock3, TriangleAlert, UserRound, MessagesSquare, Undo2, ExternalLink, Inbox } from "lucide-react";
import { Card, Btn } from "@/components/ui";
import { STATE_LABELS } from "@/lib/bot/engine";
import { fmtTime, fmtDate, localParts, todayKey } from "@/lib/booking/shared";

const FILTERS = [
  { id: "all", label: "הכל" },
  { id: "manual_agent", label: "אצל נציג" },
  { id: "bot", label: "בוט" },
  { id: "unread", label: "לא נקראו" },
];

// +972501234567 -> 050-123-4567
const localPhone = (wa) => {
  const d = wa.startsWith("972") ? `0${wa.slice(3)}` : wa;
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : d;
};
const when = (iso) => (localParts(iso).day === todayKey() ? fmtTime(iso) : fmtDate(iso, { day: "numeric", month: "numeric" }));
const windowOpen = (c) => c?.last_inbound_at && Date.now() - new Date(c.last_inbound_at).getTime() < 24 * 3600 * 1000;

function Ticks({ m }) {
  if (m.direction === "inbound") return null;
  if (m.status === "failed") return <TriangleAlert size={14} className="text-red-500" aria-label="נכשל" />;
  if (m.status === "queued") return <Clock3 size={13} className="text-[#8696a0]" aria-label="בשליחה" />;
  if (m.status === "read") return <CheckCheck size={15} className="text-[#53bdeb]" aria-label="נקרא" />;
  if (m.status === "delivered") return <CheckCheck size={15} className="text-[#8696a0]" aria-label="נמסר" />;
  return <Check size={14} className="text-[#8696a0]" aria-label={m.status === "simulated" ? "סימולציה" : "נשלח"} />;
}

function Message({ m }) {
  const mine = m.direction === "outbound";
  const options = m.payload?.options ?? [];
  return (
    <div className={`flex animate-pop-in ${mine ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[78%]">
        {mine && (
          <div className={`mb-0.5 flex items-center gap-1 text-[11px] font-semibold ${m.sender === "agent" ? "justify-end text-amber-600" : "justify-end text-emerald-700"}`}>
            {m.sender === "agent" ? <><Headset size={12} />נציג</> : <><Bot size={12} />בוט</>}
          </div>
        )}
        <div className={`rounded-xl px-2.5 pb-1.5 pt-1.5 text-[14.5px] leading-snug text-[#111b21] shadow-[0_1px_0.5px_rgba(11,20,26,0.13)] ${mine ? (m.sender === "agent" ? "rounded-se-none bg-amber-50 ring-1 ring-amber-200" : "rounded-se-none bg-[#d9fdd3]") : "rounded-ss-none bg-white"}`}>
          <span className="whitespace-pre-line break-words">{m.body || <span className="italic text-[#8696a0]">[הודעה שאינה טקסט]</span>}</span>
          <span className="float-end ms-3 mt-1.5 flex items-center gap-0.5 text-[11px] text-[#667781]">{fmtTime(m.created_at)}<Ticks m={m} /></span>
        </div>
        {options.length > 0 && (
          <div className="mt-1 flex flex-wrap justify-end gap-1">
            {options.slice(0, 10).map((o) => <span key={o.id} className="rounded-lg bg-white/80 px-2 py-0.5 text-xs font-medium text-[#027eb5] ring-1 ring-slate-200">{o.label}</span>)}
          </div>
        )}
        {m.status === "failed" && m.error && <p className="mt-1 text-end text-xs text-red-600">{m.error}</p>}
      </div>
    </div>
  );
}

export default function LiveChat({ org, db, userId, canEdit, notify, fail, onOpenLead, onSimulate }) {
  const [convs, setConvs] = useState(null);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef(null);
  const selectedRef = useRef(null);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  // Conversations + realtime updates for the whole org
  useEffect(() => {
    let alive = true;
    db.from("bot_conversations").select("*").eq("org_id", org.id).order("last_message_at", { ascending: false }).limit(200)
      .then(({ data, error }) => { if (!alive) return; if (error) fail(error, "טעינת השיחות נכשלה"); setConvs(data ?? []); });
    const channel = db.channel(`bot-${org.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bot_conversations", filter: `org_id=eq.${org.id}` }, (p) => {
        setConvs((all) => {
          const list = (all ?? []).filter((c) => c.id !== (p.new?.id ?? p.old?.id));
          return p.eventType === "DELETE" ? list : [p.new, ...list].sort((a, b) => (a.last_message_at < b.last_message_at ? 1 : -1));
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "bot_conversation_messages", filter: `org_id=eq.${org.id}` }, (p) => {
        if (p.new?.conversation_id !== selectedRef.current) return;
        setMessages((all) => {
          const i = all.findIndex((m) => m.id === p.new.id);
          return i === -1 ? [...all, p.new] : all.map((m) => (m.id === p.new.id ? p.new : m));
        });
      })
      .subscribe();
    return () => { alive = false; db.removeChannel(channel); };
  }, [org.id, db]); // eslint-disable-line react-hooks/exhaustive-deps

  const conv = convs?.find((c) => c.id === selected) ?? null;

  const open = async (c) => {
    setSelected(c.id);
    setMessages([]);
    const { data, error } = await db.from("bot_conversation_messages").select("*").eq("conversation_id", c.id).order("created_at").limit(300);
    if (error) return fail(error, "טעינת ההודעות נכשלה");
    setMessages(data ?? []);
    if (c.unread && canEdit) await db.from("bot_conversations").update({ unread: 0 }).eq("id", c.id);
  };

  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" }); }, [messages]);

  const setMode = async (mode) => {
    const patch = mode === "bot" ? { mode, state: "WELCOME", context: {}, assigned_to: null } : { mode, assigned_to: userId };
    const { data, error } = await db.from("bot_conversations").update(patch).eq("id", conv.id).select().single();
    if (error) return fail(error, "עדכון השיחה נכשל");
    setConvs((all) => all.map((c) => (c.id === data.id ? data : c)));
    notify(mode === "bot" ? "השיחה הוחזרה לבוט" : "השיחה אצלך. הבוט לא יענה לאיש הקשר הזה");
  };

  const send = async (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || !conv) return;
    setSending(true);
    const res = await fetch("/api/whatsapp/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: conv.id, text: t }) });
    const body = await res.json().catch(() => ({}));
    setSending(false);
    if (body.message) setMessages((all) => (all.some((m) => m.id === body.message.id) ? all.map((m) => (m.id === body.message.id ? body.message : m)) : [...all, body.message]));
    if (!res.ok) return notify(body.message?.error ?? (res.status === 403 ? "אין לך הרשאה לענות בשיחה הזו" : "השליחה נכשלה"), "error");
    setText("");
  };

  const lead = conv?.lead_id ? org.leads.find((l) => l.id === conv.lead_id) : null;
  const list = useMemo(() => {
    const q = query.trim();
    return (convs ?? []).filter((c) =>
      (filter === "all" || (filter === "unread" ? c.unread > 0 : c.mode === filter)) &&
      (!q || (c.contact_name ?? "").includes(q) || c.wa_id.includes(q.replace(/\D/g, "") || "\u0000")));
  }, [convs, filter, query]);
  const counts = { manual_agent: (convs ?? []).filter((c) => c.mode === "manual_agent").length, unread: (convs ?? []).filter((c) => c.unread > 0).length };

  if (convs && convs.length === 0) {
    return (
      <Card className="flex animate-fade-up flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-[#25d366] to-[#128c7e] text-white shadow-lg"><Inbox size={30} /></span>
        <h3 className="text-lg font-bold text-slate-800">עוד אין שיחות WhatsApp</h3>
        <p className="max-w-md text-[15px] text-slate-500">כשלקוחות יכתבו למספר העסקי, השיחות יופיעו כאן בזמן אמת. אפשר לראות בכל רגע מה הבוט עונה, ולהעביר שיחה לנציג.</p>
        <Btn variant="ghost" onClick={onSimulate}><Bot size={17} />לנסות את הבוט בסימולטור</Btn>
      </Card>
    );
  }

  return (
    <Card className="grid h-[calc(100vh-15rem)] min-h-[560px] animate-fade-up grid-cols-1 overflow-hidden md:grid-cols-[320px_1fr]">
      {/* conversation list */}
      <div className={`flex min-h-0 flex-col border-e border-slate-100 ${conv ? "hidden md:flex" : "flex"}`}>
        <div className="flex flex-col gap-2 border-b border-slate-100 p-3">
          <label className="flex h-10 items-center gap-2 rounded-xl bg-slate-100 px-3 text-slate-400 focus-within:ring-4 focus-within:ring-rose-100">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש שם או טלפון" aria-label="חיפוש שיחה" className="min-w-0 flex-1 bg-transparent text-[15px] text-slate-800 placeholder:text-slate-400 focus:outline-none" />
          </label>
          <div className="flex gap-1 overflow-x-auto" role="tablist">
            {FILTERS.map((f) => (
              <button key={f.id} role="tab" aria-selected={filter === f.id} onClick={() => setFilter(f.id)}
                className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold transition ${filter === f.id ? "bg-rose-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700"}`}>
                {f.label}{counts[f.id] > 0 && <span className={`rounded-full px-1.5 text-xs tabular-nums ${filter === f.id ? "bg-white/25" : "bg-white"}`}>{counts[f.id]}</span>}
              </button>
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {!convs && [0, 1, 2, 3].map((i) => <li key={i} className="m-3 h-14 animate-pulse rounded-xl bg-slate-100" />)}
          {convs && list.length === 0 && <li className="p-5 text-center text-sm text-slate-400">אין שיחות שמתאימות לסינון</li>}
          {list.map((c) => (
            <li key={c.id}>
              <button onClick={() => open(c)} className={`flex w-full items-center gap-3 px-3 py-3 text-start transition ${c.id === selected ? "bg-rose-50" : "hover:bg-slate-50"}`}>
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-sm font-bold text-white">
                  {(c.contact_name ?? "?").slice(0, 1)}
                  <span className={`absolute -bottom-0.5 -end-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white ${c.mode === "manual_agent" ? "bg-amber-400" : "bg-emerald-500"}`}>
                    {c.mode === "manual_agent" ? <Headset size={11} /> : <Bot size={11} />}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-semibold text-slate-800">{c.contact_name || localPhone(c.wa_id)}</span>
                    <span className="ms-auto shrink-0 text-xs text-slate-400 tabular-nums">{when(c.last_message_at)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm text-slate-500">{c.mode === "manual_agent" ? "אצל נציג" : STATE_LABELS[c.state]}</span>
                    {c.unread > 0 && <span className="ms-auto rounded-full bg-[#25d366] px-1.5 text-xs font-bold text-white tabular-nums">{c.unread}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* chat */}
      {!conv ? (
        <div className="hidden flex-col items-center justify-center gap-2 bg-[#f6f3ef] text-center text-slate-500 md:flex">
          <MessagesSquare size={36} className="text-slate-300" />
          <p className="text-[15px]">בחרו שיחה כדי לראות אותה ולענות</p>
        </div>
      ) : (
        <div className="flex min-h-0 flex-col">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3">
            <button onClick={() => setSelected(null)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden" aria-label="חזרה לרשימה"><Undo2 size={18} /></button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-base font-bold text-slate-800">{conv.contact_name || localPhone(conv.wa_id)}</div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <bdi dir="ltr">{localPhone(conv.wa_id)}</bdi>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${conv.mode === "manual_agent" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                  {conv.mode === "manual_agent" ? "Manual Agent · הבוט מושתק" : `בוט · ${STATE_LABELS[conv.state]}`}
                </span>
              </div>
            </div>
            {lead && <Btn variant="ghost" onClick={() => onOpenLead(lead)} className="h-10 px-3 text-sm"><UserRound size={16} />כרטיס לקוח<ExternalLink size={13} /></Btn>}
            {canEdit && (conv.mode === "manual_agent"
              ? <Btn variant="ghost" onClick={() => setMode("bot")} className="h-10 px-3 text-sm"><Bot size={16} />החזרה לבוט</Btn>
              : <Btn onClick={() => setMode("manual_agent")} className="h-10 px-3 text-sm"><Headset size={16} />העברה לנציג</Btn>)}
          </div>

          <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto bg-[#efeae2] px-4 py-4 [background-image:radial-gradient(rgba(0,0,0,0.035)_1px,transparent_1px)] [background-size:14px_14px]">
            {messages.map((m) => <Message key={m.id} m={m} />)}
          </div>

          {canEdit && (
            <form onSubmit={send} className="flex flex-col gap-1.5 border-t border-slate-100 bg-white p-3">
              {conv.mode === "bot" && <p className="text-xs text-slate-500">שליחת הודעה תעביר את השיחה אליך ותשתיק את הבוט לאיש הקשר הזה.</p>}
              {!windowOpen(conv) && <p className="flex items-center gap-1 text-xs font-medium text-amber-700"><TriangleAlert size={13} />עברו 24 שעות מההודעה האחרונה של הלקוח, ולכן WhatsApp לא יעביר הודעה חופשית.</p>}
              <div className="flex items-end gap-2">
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="הקלדת תשובה…" aria-label="תשובה ללקוח"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); } }}
                  className="max-h-32 min-h-11 flex-1 resize-none rounded-xl border border-slate-200 px-3.5 py-2.5 text-[15px] focus:border-rose-300 focus:outline-none focus:ring-4 focus:ring-rose-100" />
                <button type="submit" disabled={sending || !text.trim()} aria-label="שליחה" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-white shadow-md transition active:scale-90 disabled:opacity-40">
                  <Send size={19} className="-scale-x-100" />
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}
