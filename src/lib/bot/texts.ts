// Default bot scripts. Admins override any of them per org (bot_scripts table);
// {{vars}} are filled per message: name, business, service, date, time.

export const BOT_TEXT_KEYS = [
  "welcome",
  "fallback",
  "handoff",
  "faq_prompt",
  "anything_else",
  "service_prompt",
  "day_prompt",
  "time_prompt",
  "address_prompt",
  "summary_intro",
  "confirmed",
  "no_slots",
  "retry",
  "slot_taken",
] as const

export type BotTextKey = (typeof BOT_TEXT_KEYS)[number]
export type BotTexts = Record<BotTextKey, string>

export const DEFAULT_BOT_TEXTS: BotTexts = {
  welcome: "היי {{name}}! 👋 כאן {{business}}.\nאיך אפשר לעזור?",
  fallback: "לא בטוח שהבנתי 🙈 אפשר לבחור מהתפריט:",
  handoff: "בשמחה! 🙋 העברתי את השיחה לנציג/ה, נחזור אליך כאן ממש בקרוב.",
  faq_prompt: "על מה תרצו לשאול?",
  anything_else: "אפשר לעזור במשהו נוסף?",
  service_prompt: "איזה שירות תרצו להזמין?",
  day_prompt: "📅 באיזה יום נוח לך?",
  time_prompt: "⏰ השעות הפנויות ב{{date}}:",
  address_prompt: "{{time}} שמור לך ✨\nמה הכתובת לביקור? 📍 (רחוב, מספר ועיר)",
  summary_intro: "כמעט סיימנו! זה הסיכום:",
  confirmed: "תודה! 🙏 נתראה ב{{date}} בשעה {{time}}.",
  no_slots: "אוי, אין כרגע שעות פנויות בשבועיים הקרובים 😕 נחזור אליך ממש בקרוב.",
  retry: "לא הבנתי 🙈 אפשר לבחור באחת האפשרויות:",
  slot_taken: "אופס, מישהו תפס את השעה הזו ממש עכשיו 😅 בוא/י נבחר שעה אחרת.",
}

// Editor grouping and labels
export const BOT_TEXT_GROUPS: { title: string; items: { key: BotTextKey; label: string; vars: string[] }[] }[] = [
  {
    title: "פתיחה ותפריט",
    items: [
      { key: "welcome", label: "הודעת פתיחה", vars: ["name", "business"] },
      { key: "fallback", label: "כשהבוט לא הבין", vars: ["name", "business"] },
      { key: "faq_prompt", label: "פתיחת רשימת השאלות הנפוצות", vars: [] },
      { key: "anything_else", label: "אחרי תשובה לשאלה", vars: ["name"] },
      { key: "handoff", label: "העברה לנציג", vars: ["name", "business"] },
    ],
  },
  {
    title: "קביעת תור",
    items: [
      { key: "service_prompt", label: "בחירת שירות", vars: [] },
      { key: "day_prompt", label: "בחירת יום", vars: ["service"] },
      { key: "time_prompt", label: "בחירת שעה", vars: ["date", "service"] },
      { key: "address_prompt", label: "בקשת כתובת", vars: ["time", "date"] },
      { key: "summary_intro", label: "לפני הסיכום", vars: [] },
      { key: "confirmed", label: "אחרי אישור התור", vars: ["name", "service", "date", "time", "business"] },
      { key: "no_slots", label: "אין שעות פנויות", vars: [] },
      { key: "slot_taken", label: "השעה נתפסה", vars: [] },
      { key: "retry", label: "תשובה לא מתאימה", vars: [] },
    ],
  },
]

export const BOT_VAR_LABELS: Record<string, string> = {
  name: "שם הלקוח",
  business: "שם העסק",
  service: "שירות",
  date: "תאריך",
  time: "שעה",
}

export function botTexts(overrides?: Partial<Record<string, string>> | null): BotTexts {
  const out = { ...DEFAULT_BOT_TEXTS }
  for (const k of BOT_TEXT_KEYS) {
    const v = overrides?.[k]
    if (typeof v === "string" && v.trim()) out[k] = v
  }
  return out
}

export function fill(template: string, vars: Record<string, string | undefined>) {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? "")
    .replace(/ {2,}/g, " ")
    .replace(/ ([!?.,])/g, "$1")
    .trim()
}
