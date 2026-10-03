import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import PulseCRM from "@/components/PulseCRM"

// The UI still runs on its mock SEED data; the next step is swapping SEED for
// Supabase queries scoped by org id (organizations, memberships, leads).
export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: orgs } = await supabase.from("organizations").select("id").limit(1)

  if (!orgs?.length) redirect("/onboarding")

  return <PulseCRM />
}
