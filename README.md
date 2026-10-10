# Pulse CRM

מערכת CRM רב-ארגונית (Multi-Tenant) של ניצנט. Next.js 16 + Tailwind 4 + Supabase + Resend, פריסה ב-Vercel על `crm.nitzanet.co.il`.

## הרצה מקומית

```bash
cp .env.example .env.local   # למלא מפתחות
npm install
npm run dev
```

## מבנה

- `src/components/PulseCRM.jsx` – ממשק הדשבורד (כרגע על נתוני דמו, SEED).
- `src/lib/supabase/*` – לקוחות Supabase לדפדפן, לשרת ול-proxy (רענון סשן והגנה על נתיבים).
- `src/app/login`, `src/app/auth/callback` – התחברות בקישור קסם.
- `src/app/onboarding` – יצירת ארגון ראשון (RPC `create_organization`, היוצר הופך ל-admin).
- `src/app/api/invitations` – הזמנת משתמש לארגון (רק admin, נאכף ב-RLS) ושליחת מייל דרך Resend.
- `src/app/invite/[token]` – קבלת הזמנה (RPC `accept_invitation`, המייל חייב להתאים).
- `supabase/migrations` – הסכמה: organizations, memberships (admin/agent), invitations, leads (שלבי קנבאן), profiles, עם RLS על כל הטבלאות.

## הרשאות

| פעולה | admin | agent |
|---|---|---|
| צפייה ועריכת לידים | ✓ | ✓ |
| מחיקת לידים | ✓ | |
| הזמנת משתמשים ושינוי תפקידים | ✓ | |
| עריכת הגדרות ארגון | ✓ | |

## תורים, אוטומציות ובוט WhatsApp

- `supabase/migrations/20261005000000_booking_automations.sql` – שירותים (משך, מחיר, שאלות המשך), שעות זמינות וימים חסומים, תורים (עם הגנה מכפל הזמנות), תור הודעות (`notification_jobs`), וטבלאות מוכנות לסנכרון Google Calendar.
- `/book/<slug>` – דף הזמנה ציבורי ב-5 שלבים. ה-RPC `book_appointment` בודק שהשעה פנויה, פותח/מקשר ליד ומתזמן אישור ותזכורת.
- `/api/book` שולח את האישור מיד; `/api/cron/notifications` (פעם ביום) שולח תזכורות. שניהם צריכים `CRON_SECRET`.
- WhatsApp: `src/lib/notify/whatsapp.ts` – מצב הדגמה עד שמגדירים `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` (Meta Cloud API).
- הבוט: `src/lib/bot/flow.ts` (תהליך קביעת התור) ו-`src/lib/bot/engine.ts` (תפריט, שאלות נפוצות, העברה לנציג, מצבי שיחה). אותו קוד מריץ את הסימולטור בדשבורד ואת ה-webhook.

## בוט WhatsApp נייטיב ו-Google Calendar

- `supabase/migrations/20261010000000_whatsapp_bot.sql` – תוכן הבוט לכל ארגון (`bot_settings`, `bot_scripts`, `bot_menu_items`, `bot_faqs`), שיחות עם מצב ומצב Manual Agent (`bot_conversations`), יומן הודעות (`bot_conversation_messages`), ו-RPCs לשרת שמוגנים ב-`CRON_SECRET`. הגדרות היומן משתמשות במה שכבר קיים: `organizations.booking_*`, `availability_rules`, `availability_blocks`, `services.duration_minutes`.
- `/api/whatsapp/webhook` – אימות מול Meta (GET) וקבלת הודעות (POST, חתימת `X-Hub-Signature-256`). כל מספר עסקי משויך לארגון לפי `bot_settings.whatsapp_phone_number_id`. מצבי שיחה: `WELCOME → SERVICE_SELECT → SERVICE_QUESTIONS → DATE_SELECT → TIME_SELECT → ADDRESS → CONFIRM → CONFIRMED`, ובנוסף `FAQ`.
- באישור התור: `book_appointment` יוצר או מקשר ליד ויוצר את התור, האירוע נכתב ל-Google Calendar, והלקוח מקבל אישור בוואטסאפ עם הפרטים.
- `src/lib/calendar/google.ts` – `getAvailableSlots` (זמינות מה-CRM פחות שעות תפוסות ב-Google) ו-`createCalendarEvent`, וגם `syncPendingAppointments` לתורים שנוצרו בדף, ידנית או בבוט. חיבור OAuth: `/api/calendar/google/connect` ו-`/callback`.
- `/api/whatsapp/send` – תשובת נציג מהשיחות החיות. שליחה מעבירה את השיחה ל-Manual Agent, והבוט מושתק לאיש הקשר הזה עד שמחזירים אותו לבוט.
- בדשבורד: ״בוט WhatsApp״ ← שיחות חיות, תוכן הבוט, הגדרות יומן, חיבור WhatsApp, סימולטור.
