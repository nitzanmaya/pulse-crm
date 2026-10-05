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
- הבוט: `src/lib/bot/flow.ts` – מכונת מצבים שמשמשת את הסימולטור בדשבורד, ותשמש webhook אמיתי בהמשך.
