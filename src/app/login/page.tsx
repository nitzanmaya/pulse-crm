import { signInWithEmail } from "./actions"
import { SubmitButton } from "./submit-button"

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams
  const next = typeof params.next === "string" ? params.next : "/dashboard"

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form
        action={signInWithEmail}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-zinc-900/60 p-8 backdrop-blur"
      >
        <h1 className="text-2xl font-bold">Pulse CRM</h1>
        <p className="text-sm text-zinc-400">התחברות עם קישור קסם למייל</p>
        <input type="hidden" name="next" value={next} />
        <input
          name="email"
          type="email"
          required
          placeholder="you@company.co.il"
          dir="ltr"
          className="w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-white/30"
        />
        <SubmitButton />
        {params.sent && <p className="text-sm text-emerald-400">נשלח קישור התחברות למייל.</p>}
        {params.error === "rate-limited" && (
          <p className="text-sm text-amber-400">כבר נשלח קישור לפני רגע. בדקו את המייל (גם בספאם), או נסו שוב בעוד דקה.</p>
        )}
        {params.error && params.error !== "rate-limited" && <p className="text-sm text-red-400">משהו השתבש, נסו שוב.</p>}
      </form>
    </main>
  )
}
