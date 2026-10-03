import { signInWithEmail } from "./actions"

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
        <button className="w-full rounded-lg bg-white py-2 text-sm font-semibold text-zinc-950 hover:bg-zinc-200">
          שליחת קישור
        </button>
        {params.sent && <p className="text-sm text-emerald-400">נשלח קישור התחברות למייל.</p>}
        {params.error && <p className="text-sm text-red-400">משהו השתבש, נסו שוב.</p>}
      </form>
    </main>
  )
}
