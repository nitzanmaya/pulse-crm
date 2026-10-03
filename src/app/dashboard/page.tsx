import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { loadOrgs } from "@/lib/crm/load"
import PulseCRM from "@/components/PulseCRM"

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const userId = data?.claims.sub
  if (!userId) redirect("/login?next=/dashboard")

  const orgs = await loadOrgs(supabase, userId)
  if (!orgs.length) redirect("/onboarding")

  return <PulseCRM initialOrgs={orgs} userId={userId} />
}
