import type { Metadata } from "next"
import { LEGAL_CONTACT, LegalPage } from "@/components/LegalPage"

export const metadata: Metadata = { title: "תנאי שימוש · Pulse CRM", robots: { index: true, follow: true } }

export default function TermsPage() {
  return (
    <LegalPage title="תנאי שימוש">
      <p>
        השימוש ב-Pulse CRM, המופעלת על ידי ניצנט בכתובת crm.nitzanet.co.il, כפוף לתנאים אלה.
      </p>

      <h2>השירות</h2>
      <p>
        המערכת מאפשרת לעסקים לנהל לקוחות, יומן ותורים, לקבל הזמנות דרך דף הזמנה ובוט WhatsApp, ולסנכרן תורים עם יומן Google.
      </p>

      <h2>אחריות העסק</h2>
      <ul>
        <li>העסק אחראי לכך שיש לו הסכמה לשמור את פרטי הלקוחות שלו ולפנות אליהם.</li>
        <li>העסק אחראי לתוכן ההודעות שהוא שולח ללקוחות דרך המערכת.</li>
        <li>אין להשתמש במערכת לשליחת דואר זבל או לכל מטרה שאינה חוקית.</li>
      </ul>

      <h2>זמינות</h2>
      <p>
        אנחנו עושים מאמץ שהמערכת תהיה זמינה ותקינה, אך היא ניתנת כפי שהיא (AS IS), ואיננו אחראים לנזק עקיף כתוצאה מתקלה או מהשבתה.
      </p>

      <h2>פרטיות</h2>
      <p>
        השימוש במידע מתואר ב<a href="/privacy" className="text-rose-600 underline">מדיניות הפרטיות</a>.
      </p>

      <h2>יצירת קשר</h2>
      <p>
        <a href={`mailto:${LEGAL_CONTACT}`} className="text-rose-600 underline" dir="ltr">{LEGAL_CONTACT}</a>
      </p>
    </LegalPage>
  )
}
