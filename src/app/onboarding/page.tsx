import { ArrowLeft, TriangleAlert } from "lucide-react"
import { AuthShell, authButton, authInput } from "@/components/AuthShell"
import { createOrganization } from "./actions"

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const { error } = await searchParams

  return (
    <AuthShell>
      <form action={createOrganization} className="space-y-5">
        <div>
          <span className="inline-flex rounded-full bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-600">שלב אחרון</span>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">נעים להכיר! עוד צעד אחד</h1>
          <p className="mt-1.5 text-base leading-relaxed text-slate-500">
            תנו שם לעסק או לארגון שלכם. אחרי זה תגיעו ללוח הלידים, ותוכלו להזמין את הצוות.
          </p>
        </div>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-600">שם העסק</span>
          <input name="name" required autoFocus placeholder="למשל: נצנט שיווק דיגיטלי" className={authInput} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-600">מזהה קצר באנגלית</span>
          <input name="slug" required pattern="[a-z0-9-]{2,48}" placeholder="nitzanet" dir="ltr" className={authInput} />
          <span className="block text-sm text-slate-400">אותיות קטנות באנגלית, מספרים ומקפים בלבד.</span>
        </label>
        <button className={authButton}>
          יצירת הארגון והמשך <ArrowLeft size={19} />
        </button>
        {error && (
          <div className="flex gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
            <TriangleAlert size={19} className="mt-0.5 shrink-0" />
            <p>לא ניתן ליצור את הארגון. ייתכן שהמזהה תפוס, נסו מזהה אחר.</p>
          </div>
        )}
      </form>
    </AuthShell>
  )
}
