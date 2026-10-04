import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { AuthShell } from "@/components/AuthShell"

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()

  if (!data?.claims) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`)

  const { error } = await supabase.rpc("accept_invitation", { _token: token })
  if (!error) redirect("/dashboard")

  return (
    <AuthShell>
      <div className="text-center">
        <h1 className="text-xl font-bold text-slate-900">לא ניתן לצרף אותך לארגון</h1>
        <p className="mt-2 text-base text-slate-500">ההזמנה פגה, כבר נוצלה, או נשלחה לכתובת מייל אחרת. בקשו ממנהל הארגון לשלוח הזמנה חדשה.</p>
      </div>
    </AuthShell>
  )
}
