"use client";

import React, { useRef, useState } from "react";
import { ListOrdered, HelpCircle, MessageSquareText, Plus, PencilLine, Trash2, ArrowUp, ArrowDown, Check, Braces, Undo2, CalendarCheck, Headset, Reply, X } from "lucide-react";
import { Card, Btn, Field, inputCls, SectionTitle, Modal, Toggle } from "@/components/ui";
import { BOT_TEXT_GROUPS, BOT_VAR_LABELS, DEFAULT_BOT_TEXTS, fill } from "@/lib/bot/texts";

const ACTIONS = {
  book: { label: "קביעת תור", text: "מתחיל את תהליך קביעת התור", icon: CalendarCheck },
  faqs: { label: "רשימת שאלות נפוצות", text: "מציג את כל השאלות הפעילות", icon: HelpCircle },
  faq: { label: "תשובה לשאלה אחת", text: "עונה על שאלה נפוצה מסוימת", icon: HelpCircle },
  handoff: { label: "העברה לנציג", text: "משתיק את הבוט ומעביר לשיחה חיה", icon: Headset },
  reply: { label: "תשובה קבועה", text: "שולח טקסט שכתבתם", icon: Reply },
};

const parseKeywords = (s) => [...new Set(s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean))].slice(0, 30);

/* ------------------------------- modals ------------------------------- */

function MenuItemModal({ item, faqs, onClose, onSave }) {
  const [d, setD] = useState({ label: item.label ?? "", description: item.description ?? "", action: item.action ?? "book", faq_id: item.faq_id ?? faqs[0]?.id ?? null, reply: item.reply ?? "", is_active: item.is_active ?? true });
  const valid = d.label.trim() && (d.action !== "faq" || d.faq_id) && (d.action !== "reply" || d.reply.trim());
  return (
    <Modal open onClose={onClose} title={item.id ? "עריכת כפתור בתפריט" : "כפתור חדש בתפריט"}>
      <div className="flex flex-col gap-4">
        <Field label={`טקסט הכפתור (${d.label.length}/24)`}>
          <input className={inputCls} value={d.label} maxLength={24} onChange={(e) => setD({ ...d, label: e.target.value })} placeholder="לדוגמה: 📅 קביעת תור" autoFocus />
        </Field>
        <Field label="שורת הסבר (לא חובה)">
          <input className={inputCls} value={d.description} maxLength={72} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="מופיעה מתחת לכפתור ברשימה" />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-slate-600">מה קורה בלחיצה</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(ACTIONS).map(([k, a]) => (
              <button key={k} type="button" onClick={() => setD({ ...d, action: k })} aria-pressed={d.action === k}
                className={`flex items-start gap-2.5 rounded-xl border p-3 text-start transition ${d.action === k ? "border-rose-300 bg-rose-50 ring-4 ring-rose-100" : "border-slate-200 hover:bg-slate-50"}`}>
                <a.icon size={18} className={d.action === k ? "mt-0.5 text-rose-600" : "mt-0.5 text-slate-400"} />
                <span><span className="block text-[15px] font-semibold text-slate-800">{a.label}</span><span className="block text-xs text-slate-500">{a.text}</span></span>
              </button>
            ))}
          </div>
        </div>
        {d.action === "faq" && (
          <Field label="איזו שאלה">
            <select className={inputCls} value={d.faq_id ?? ""} onChange={(e) => setD({ ...d, faq_id: e.target.value })}>
              {faqs.length === 0 && <option value="">קודם הוסיפו שאלה נפוצה</option>}
              {faqs.map((f) => <option key={f.id} value={f.id}>{f.question}</option>)}
            </select>
          </Field>
        )}
        {d.action === "reply" && (
          <Field label="הטקסט שהבוט ישלח">
            <textarea rows={4} className={`${inputCls} leading-relaxed`} value={d.reply} maxLength={1000} onChange={(e) => setD({ ...d, reply: e.target.value })} />
          </Field>
        )}
        <Toggle checked={d.is_active} onChange={(v) => setD({ ...d, is_active: v })} icon={Check} title="מוצג בתפריט" text={d.is_active ? "הלקוחות רואים את הכפתור" : "מוסתר"} />
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>ביטול</Btn>
          <Btn disabled={!valid} onClick={() => onSave({ ...d, label: d.label.trim(), description: d.description.trim() || null, faq_id: d.action === "faq" ? d.faq_id : null, reply: d.action === "reply" ? d.reply.trim() : null })}><Check size={17} />שמירה</Btn>
        </div>
      </div>
    </Modal>
  );
}

function FaqModal({ faq, onClose, onSave }) {
  const [d, setD] = useState({ question: faq.question ?? "", answer: faq.answer ?? "", keywords: (faq.keywords ?? []).join(", "), is_active: faq.is_active ?? true });
  const kw = parseKeywords(d.keywords);
  return (
    <Modal open onClose={onClose} title={faq.id ? "עריכת שאלה נפוצה" : "שאלה נפוצה חדשה"} wide>
      <div className="flex flex-col gap-4">
        <Field label="השאלה (כך היא תופיע ברשימה)">
          <input className={inputCls} value={d.question} maxLength={120} onChange={(e) => setD({ ...d, question: e.target.value })} placeholder="לדוגמה: באילו אזורים אתם עובדים?" autoFocus />
        </Field>
        <Field label="התשובה של הבוט">
          <textarea rows={5} className={`${inputCls} leading-relaxed`} value={d.answer} maxLength={1000} onChange={(e) => setD({ ...d, answer: e.target.value })} placeholder="לדוגמה: אנחנו מגיעים לכל גוש דן והשרון 🚐" />
        </Field>
        <Field label="מילות מפתח (מופרדות בפסיק). אם לקוח כותב אחת מהן, הבוט עונה אוטומטית">
          <input className={inputCls} value={d.keywords} onChange={(e) => setD({ ...d, keywords: e.target.value })} placeholder="אזור, איפה, מגיעים, ערים" />
        </Field>
        {kw.length > 0 && <div className="flex flex-wrap gap-1.5">{kw.map((k) => <span key={k} className="rounded-full bg-violet-50 px-2.5 py-0.5 text-sm font-medium text-violet-700">{k}</span>)}</div>}
        <Toggle checked={d.is_active} onChange={(v) => setD({ ...d, is_active: v })} icon={Check} title="פעילה" text={d.is_active ? "הבוט משתמש בתשובה הזו" : "כבויה"} />
        <div className="flex justify-end gap-2">
          <Btn variant="ghost" onClick={onClose}>ביטול</Btn>
          <Btn disabled={!d.question.trim() || !d.answer.trim()} onClick={() => onSave({ question: d.question.trim(), answer: d.answer.trim(), keywords: kw, is_active: d.is_active })}><Check size={17} />שמירה</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------ scripts ------------------------------ */

function ScriptField({ item, value, saved, isAdmin, onSave, onReset }) {
  const [v, setV] = useState(value);
  const area = useRef(null);
  const dirty = v !== value;
  const insert = (k) => {
    const el = area.current;
    const at = el?.selectionStart ?? v.length;
    setV(`${v.slice(0, at)}{{${k}}}${v.slice(el?.selectionEnd ?? at)}`);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(at + k.length + 4, at + k.length + 4); });
  };
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-slate-200 p-3.5 transition focus-within:border-rose-200 focus-within:bg-rose-50/20">
      <div className="flex items-center gap-2">
        <span className="text-[15px] font-semibold text-slate-800">{item.label}</span>
        {saved && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-semibold text-violet-700">מותאם</span>}
        {saved && isAdmin && <button type="button" onClick={() => { setV(DEFAULT_BOT_TEXTS[item.key]); onReset(); }} className="ms-auto inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-rose-600"><Undo2 size={13} />ברירת מחדל</button>}
      </div>
      <textarea ref={area} rows={Math.min(6, Math.max(2, v.split("\n").reduce((n, line) => n + Math.ceil((line.length || 1) / 42), 0)))} className={`${inputCls} leading-relaxed`} value={v} maxLength={1000} disabled={!isAdmin} onChange={(e) => setV(e.target.value)} />
      {isAdmin && (
        <div className="flex flex-wrap items-center gap-1.5">
          {item.vars.length > 0 && <Braces size={14} className="text-slate-400" />}
          {item.vars.map((k) => (
            <button key={k} type="button" onClick={() => insert(k)} className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 active:scale-95">{BOT_VAR_LABELS[k]}</button>
          ))}
          {dirty && <Btn disabled={!v.trim()} onClick={() => onSave(v)} className="ms-auto h-9 px-3.5 text-sm"><Check size={15} />שמירה</Btn>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------- preview ------------------------------- */

function MenuPreview({ org, menu, scripts }) {
  const welcome = fill(scripts.welcome ?? DEFAULT_BOT_TEXTS.welcome, { name: "דנה", business: org.name });
  const items = menu.filter((m) => m.is_active);
  return (
    <div className="rounded-[1.6rem] bg-[#efeae2] p-3 shadow-inner ring-1 ring-slate-200 [background-image:radial-gradient(rgba(0,0,0,0.035)_1px,transparent_1px)] [background-size:14px_14px]">
      <div className="mb-2 flex items-center gap-2 rounded-xl bg-[#008069] px-3 py-2 text-white">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-rose-400 to-pink-500 text-xs font-bold">{org.name[0]}</span>
        <span className="text-sm font-semibold">{org.name}</span>
      </div>
      <div className="max-w-[92%] rounded-xl rounded-ss-none bg-white px-3 py-2 text-[14px] leading-snug text-[#111b21] shadow-sm">
        <span className="whitespace-pre-line">{welcome}</span>
      </div>
      <div className="mt-1 grid max-w-[92%] gap-1">
        {items.length === 0 && <span className="rounded-xl bg-white/70 px-3 py-2 text-center text-xs text-slate-500">התפריט ריק</span>}
        {items.map((m) => (
          <span key={m.id} className="rounded-xl bg-white px-3 py-1.5 text-center shadow-sm">
            <span className="block text-[14px] font-medium text-[#027eb5]">{m.label}</span>
            {m.description && <span className="block text-[11.5px] text-[#667781]">{m.description}</span>}
          </span>
        ))}
      </div>
      <p className="mt-2 text-center text-[11px] text-[#667781]">{items.length <= 3 ? "יוצג ככפתורים" : "יוצג כרשימה לבחירה"}</p>
    </div>
  );
}

/* -------------------------------- page -------------------------------- */

export default function BotContentEditor({ org, db, isAdmin, notify, fail, patchOrg }) {
  const { menu, faqs, scripts } = org.bot;
  const [menuModal, setMenuModal] = useState(null);
  const [faqModal, setFaqModal] = useState(null);
  const patchBot = (fn) => patchOrg((o) => ({ ...o, bot: fn(o.bot) }));

  const saveMenu = async (d) => {
    const item = menuModal;
    const { data, error } = item.id
      ? await db.from("bot_menu_items").update(d).eq("id", item.id).select().single()
      : await db.from("bot_menu_items").insert({ ...d, org_id: org.id, position: menu.length }).select().single();
    if (error) return fail(error, "שמירת הכפתור נכשלה");
    patchBot((b) => ({ ...b, menu: item.id ? b.menu.map((m) => (m.id === data.id ? data : m)) : [...b.menu, data] }));
    setMenuModal(null);
    notify("התפריט עודכן");
  };
  const removeMenu = async (id) => {
    const { error } = await db.from("bot_menu_items").delete().eq("id", id).select("id").single();
    if (error) return fail(error, "מחיקת הכפתור נכשלה");
    patchBot((b) => ({ ...b, menu: b.menu.filter((m) => m.id !== id) }));
    notify("הכפתור הוסר מהתפריט");
  };
  const move = async (i, dir) => {
    const next = [...menu];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    const ordered = next.map((m, position) => ({ ...m, position }));
    patchBot((b) => ({ ...b, menu: ordered }));
    const results = await Promise.all([ordered[i], ordered[j]].map((m) => db.from("bot_menu_items").update({ position: m.position }).eq("id", m.id)));
    const error = results.find((r) => r.error)?.error;
    if (error) fail(error, "שינוי הסדר נכשל");
  };

  const saveFaq = async (d) => {
    const faq = faqModal;
    const { data, error } = faq.id
      ? await db.from("bot_faqs").update(d).eq("id", faq.id).select().single()
      : await db.from("bot_faqs").insert({ ...d, org_id: org.id, position: faqs.length }).select().single();
    if (error) return fail(error, "שמירת השאלה נכשלה");
    patchBot((b) => ({ ...b, faqs: faq.id ? b.faqs.map((f) => (f.id === data.id ? data : f)) : [...b.faqs, data] }));
    setFaqModal(null);
    notify(faq.id ? "השאלה עודכנה" : "השאלה נוספה לבוט");
  };
  const removeFaq = async (id) => {
    const { error } = await db.from("bot_faqs").delete().eq("id", id).select("id").single();
    if (error) return fail(error, "מחיקת השאלה נכשלה");
    // Menu buttons pointing at this answer are removed with it (on delete cascade)
    patchBot((b) => ({ ...b, faqs: b.faqs.filter((f) => f.id !== id), menu: b.menu.filter((m) => m.faq_id !== id) }));
    notify("השאלה נמחקה");
  };

  const saveScript = async (key, body) => {
    const { error } = await db.from("bot_scripts").upsert({ org_id: org.id, key, body }, { onConflict: "org_id,key" }).select("id").single();
    if (error) return fail(error, "שמירת הנוסח נכשלה");
    patchBot((b) => ({ ...b, scripts: { ...b.scripts, [key]: body } }));
    notify("הנוסח נשמר");
  };
  const resetScript = async (key) => {
    const { error } = await db.from("bot_scripts").delete().eq("org_id", org.id).eq("key", key);
    if (error) return fail(error, "האיפוס נכשל");
    patchBot((b) => { const next = { ...b.scripts }; delete next[key]; return { ...b, scripts: next }; });
    notify("חזר לנוסח ברירת המחדל");
  };

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px]">
      <div className="flex min-w-0 flex-col gap-5">
        {/* menu */}
        <Card className="animate-fade-up p-6">
          <SectionTitle icon={ListOrdered} action={isAdmin && <Btn variant="ghost" onClick={() => setMenuModal({})} className="h-10 px-3.5 text-sm"><Plus size={16} />כפתור</Btn>}>תפריט הפתיחה</SectionTitle>
          <p className="mt-1 text-sm text-slate-500">הכפתורים שהלקוח רואה אחרי הודעת הפתיחה. עד 3 כפתורים מוצגים ככפתורים, ויותר מזה כרשימה.</p>
          <ul className="mt-4 flex flex-col gap-2">
            {menu.length === 0 && <li className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">אין כפתורים. בלי תפריט הבוט יענה רק על שאלות נפוצות.</li>}
            {menu.map((m, i) => {
              const A = ACTIONS[m.action];
              const faq = m.action === "faq" && faqs.find((f) => f.id === m.faq_id);
              return (
                <li key={m.id} className={`flex animate-pop-in items-center gap-3 rounded-2xl border border-slate-200 p-3 transition hover:border-rose-200 ${m.is_active ? "" : "opacity-60"}`}>
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600"><A.icon size={19} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-slate-800">{m.label}{!m.is_active && <span className="ms-2 text-xs font-medium text-slate-400">מוסתר</span>}</span>
                    <span className="block truncate text-sm text-slate-500">{faq ? `עונה: ${faq.question}` : m.action === "reply" ? m.reply : A.label}</span>
                  </span>
                  {isAdmin && (
                    <span className="flex shrink-0 items-center">
                      <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="למעלה" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"><ArrowUp size={16} /></button>
                      <button onClick={() => move(i, 1)} disabled={i === menu.length - 1} aria-label="למטה" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"><ArrowDown size={16} /></button>
                      <button onClick={() => setMenuModal(m)} aria-label="עריכה" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"><PencilLine size={16} /></button>
                      <button onClick={() => removeMenu(m.id)} aria-label="מחיקה" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>

        {/* FAQ */}
        <Card className="animate-fade-up p-6" style={{ animationDelay: "60ms" }}>
          <SectionTitle icon={HelpCircle} color="text-violet-500" action={isAdmin && <Btn variant="ghost" onClick={() => setFaqModal({})} className="h-10 px-3.5 text-sm"><Plus size={16} />שאלה</Btn>}>שאלות ותשובות אוטומטיות</SectionTitle>
          <p className="mt-1 text-sm text-slate-500">כשלקוח כותב מילת מפתח (גם באמצע קביעת תור), הבוט עונה בתשובה המוכנה וממשיך מאיפה שעצר.</p>
          <ul className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {faqs.length === 0 && <li className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500 lg:col-span-2">עוד אין שאלות נפוצות.</li>}
            {faqs.map((f) => (
              <li key={f.id} className={`group flex animate-pop-in flex-col gap-2 rounded-2xl border border-slate-200 p-4 transition hover:border-violet-200 hover:shadow-md ${f.is_active ? "" : "opacity-60"}`}>
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 text-[15px] font-semibold text-slate-800">{f.question}</span>
                  {isAdmin && (
                    <span className="flex shrink-0 opacity-70 transition group-hover:opacity-100">
                      <button onClick={() => setFaqModal(f)} aria-label="עריכה" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-violet-50 hover:text-violet-600"><PencilLine size={16} /></button>
                      <button onClick={() => removeFaq(f.id)} aria-label="מחיקה" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 size={16} /></button>
                    </span>
                  )}
                </div>
                <p className="line-clamp-3 whitespace-pre-line text-sm text-slate-600">{f.answer}</p>
                <div className="flex flex-wrap gap-1">
                  {f.keywords.length === 0 && <span className="text-xs text-slate-400">בלי מילות מפתח, מופיעה רק ברשימה</span>}
                  {f.keywords.map((k) => <span key={k} className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">{k}</span>)}
                  {!f.is_active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500"><X size={10} className="inline" /> כבויה</span>}
                </div>
              </li>
            ))}
          </ul>
        </Card>

        {/* scripts */}
        <Card className="animate-fade-up p-6" style={{ animationDelay: "120ms" }}>
          <SectionTitle icon={MessageSquareText} color="text-emerald-500">נוסחי ההודעות</SectionTitle>
          <p className="mt-1 text-sm text-slate-500">כל הודעה שהבוט שולח בשיחה. מה שלא שיניתם משתמש בנוסח ברירת המחדל.</p>
          {BOT_TEXT_GROUPS.map((g) => (
            <div key={g.title} className="mt-5">
              <h4 className="mb-2.5 text-sm font-bold uppercase tracking-wide text-slate-400">{g.title}</h4>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                {g.items.map((item) => (
                  <ScriptField key={`${item.key}:${scripts[item.key] ?? ""}`} item={item} value={scripts[item.key] ?? DEFAULT_BOT_TEXTS[item.key]} saved={item.key in scripts} isAdmin={isAdmin}
                    onSave={(v) => saveScript(item.key, v)} onReset={() => resetScript(item.key)} />
                ))}
              </div>
            </div>
          ))}
        </Card>
      </div>

      <div className="flex flex-col gap-3 xl:sticky xl:top-24 xl:h-fit">
        <h3 className="text-sm font-semibold text-slate-600">כך זה נראה בוואטסאפ</h3>
        <MenuPreview org={org} menu={menu} scripts={scripts} />
        <p className="text-sm text-slate-500">לשיחה מלאה עם התוכן השמור, פתחו את לשונית ״סימולטור״.</p>
      </div>

      {menuModal && <MenuItemModal item={menuModal} faqs={faqs} onClose={() => setMenuModal(null)} onSave={saveMenu} />}
      {faqModal && <FaqModal faq={faqModal} onClose={() => setFaqModal(null)} onSave={saveFaq} />}
    </div>
  );
}
