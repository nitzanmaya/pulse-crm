import { CircleCheck, Clock, TriangleAlert } from "lucide-react"
import { AuthShell, authInput } from "@/components/AuthShell"
import { signInWithEmail } from "./actions"
import { SubmitButton } from "./submit-button"

const Notice = ({ tone, icon: Icon, children }: { tone: string; icon: typeof Clock; children: React.ReactNode }) => (
  <div className={`flex animate-fade-up gap-2.5 rounded-xl border p-3.5 text-sm leading-relaxed ${tone}`}>
    <Icon size={19} className="mt-0.5 shrink-0" />
    <p>{children}</p>
  </div>
)

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams
  const next = typeof params.next === "string" ? params.next : "/dashboard"

  return (
    <AuthShell>
      <form action={signInWithEmail} className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">ברוכים הבאים!</h1>
          <p className="mt-1.5 text-base leading-relaxed text-slate-500">
            הזינו את כתובת המייל שלכם ונשלח אליכם קישור כניסה. אין צורך בסיסמה, וזה עובד גם בפעם הראשונה.
          </p>
        </div>
        <input type="hidden" name="next" value={next} />
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-slate-600">כתובת מייל</span>
          <input name="email" type="email" required autoFocus placeholder="you@company.co.il" dir="ltr" className={authInput} />
        </label>
        <SubmitButton />
        {params.sent && (
          <Notice tone="border-emerald-200 bg-emerald-50 text-emerald-800" icon={CircleCheck}>
            שלחנו לכם מייל מ-Pulse CRM. לחצו על הכפתור שבו כדי להיכנס (אפשר גם מהטלפון). הקישור תקף לשעה. לא רואים אותו? בדקו בספאם.
          </Notice>
        )}
        {params.error === "rate-limited" && (
          <Notice tone="border-amber-200 bg-amber-50 text-amber-800" icon={Clock}>
            כבר נשלח קישור לפני רגע. בדקו את המייל (גם בספאם), או נסו שוב בעוד דקה.
          </Notice>
        )}
        {params.error === "link-expired" && (
          <Notice tone="border-amber-200 bg-amber-50 text-amber-800" icon={Clock}>
            קישור הכניסה פג תוקף או שכבר השתמשו בו. הזינו את המייל שוב ונשלח קישור חדש.
          </Notice>
        )}
        {params.error && params.error !== "rate-limited" && params.error !== "link-expired" && (
          <Notice tone="border-red-200 bg-red-50 text-red-700" icon={TriangleAlert}>
            משהו השתבש, נסו שוב.
          </Notice>
        )}
      </form>
    </AuthShell>
  )
}
