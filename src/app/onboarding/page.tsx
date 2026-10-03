import { createOrganization } from "./actions"

export default async function OnboardingPage({ searchParams }: PageProps<"/onboarding">) {
  const { error } = await searchParams
  const field = "w-full rounded-lg border border-white/10 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-white/30"

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={createOrganization} className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-zinc-900/60 p-8">
        <h1 className="text-xl font-bold">יצירת ארגון חדש</h1>
        <input name="name" required placeholder="Nitzanet Agency" className={field} />
        <input name="slug" required pattern="[a-z0-9-]{2,48}" placeholder="nitzanet" dir="ltr" className={field} />
        <button className="w-full rounded-lg bg-white py-2 text-sm font-semibold text-zinc-950">יצירה</button>
        {error && <p className="text-sm text-red-400">לא ניתן ליצור את הארגון. ייתכן שהמזהה תפוס.</p>}
      </form>
    </main>
  )
}
