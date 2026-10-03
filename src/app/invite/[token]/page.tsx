import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`)

  const { error } = await supabase.rpc("accept_invitation", { _token: token })
  if (!error) redirect("/dashboard")

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="max-w-sm rounded-2xl border border-white/10 bg-zinc-900/60 p-8 text-center">
        <h1 className="text-xl font-bold">לא ניתן לצרף אותך לארגון</h1>
        <p className="mt-2 text-sm text-zinc-400">ההזמנה פגה, כבר נוצלה, או נשלחה לכתובת מייל אחרת.</p>
      </div>
    </main>
  )
}
