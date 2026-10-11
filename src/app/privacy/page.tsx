import type { Metadata } from "next"
import { LEGAL_CONTACT, LegalPage } from "@/components/LegalPage"

export const metadata: Metadata = { title: "מדיניות פרטיות · Pulse CRM", robots: { index: true, follow: true } }

export default function PrivacyPage() {
  return (
    <LegalPage title="מדיניות פרטיות">
      <p>
        Pulse CRM (להלן &quot;המערכת&quot;) היא מערכת לניהול לקוחות, יומן ותורים לעסקים, המופעלת על ידי ניצנט בכתובת crm.nitzanet.co.il.
        מדיניות זו מסבירה איזה מידע המערכת אוספת, איך משתמשים בו ואיך שומרים עליו.
      </p>

      <h2>איזה מידע נאסף</h2>
      <ul>
        <li>פרטי משתמשי העסק: שם וכתובת מייל לצורך כניסה למערכת.</li>
        <li>פרטי לקוחות שהעסק מנהל או שקבעו תור: שם, טלפון, כתובת, מייל (אם נמסר) ופרטי התור.</li>
        <li>הודעות שנשלחו או התקבלו דרך המערכת, למשל בבוט ה-WhatsApp העסקי.</li>
      </ul>

      <h2>שימוש בנתוני Google</h2>
      <p>
        עסק יכול לבחור לחבר את יומן Google שלו. במקרה זה המערכת מבקשת גישה רק ל&quot;זמינות&quot; (free/busy) ולאירועי היומן, ומשתמשת בה כדי:
      </p>
      <ul>
        <li>להציע ללקוחות רק שעות פנויות ביומן העסק.</li>
        <li>להוסיף, לעדכן ולבטל ביומן העסק את התורים שנקבעו דרך המערכת.</li>
      </ul>
      <p>
        המערכת לא קוראת את תוכן האירועים האחרים ביומן, לא מוכרת נתוני Google, לא מעבירה אותם לצד שלישי ולא משתמשת בהם לפרסום.
        השימוש במידע המתקבל מ-Google APIs עומד ב-
        <a href="https://developers.google.com/terms/api-services-user-data-policy" className="text-rose-600 underline" dir="ltr">Google API Services User Data Policy</a>,
        כולל דרישות ה-Limited Use. אפשר לנתק את החיבור בכל עת מתוך המערכת או מהגדרות חשבון Google, ואז אסימוני הגישה נמחקים.
      </p>

      <h2>שמירה ואבטחה</h2>
      <p>
        המידע נשמר בשרתים מאובטחים (Supabase ו-Vercel), בהצפנה בזמן העברה, וכל עסק רואה רק את המידע של עצמו.
        מיילים נשלחים באמצעות Resend. המידע נשמר כל עוד העסק משתמש במערכת, או עד שתתבקש מחיקה.
      </p>

      <h2>הזכויות שלך</h2>
      <p>
        אפשר לבקש לעיין במידע, לתקן אותו או למחוק אותו. לקוחות של עסק יכולים לפנות לעסק עצמו או אלינו.
      </p>

      <h2>יצירת קשר</h2>
      <p>
        לשאלות על פרטיות: <a href={`mailto:${LEGAL_CONTACT}`} className="text-rose-600 underline" dir="ltr">{LEGAL_CONTACT}</a>
      </p>
    </LegalPage>
  )
}
