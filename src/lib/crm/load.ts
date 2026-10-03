import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database, Enums, Tables } from "@/lib/database.types"

// Shapes consumed by the PulseCRM client component
export type UiRole = "Owner" | "Admin" | "Agent" | "Viewer"

export type UiMember = {
  id: string
  name: string
  email: string
  role: UiRole
  status: "active" | "pending"
  color: number
  inviteId?: string
}

export type UiLead = {
  id: string
  name: string
  contact: string
  phone: string
  email: string
  value: number
  stage: Enums<"lead_stage">
  owner: string | null
  tags: string[]
  source: string
  created: string
  note: string
}

export type UiOrg = {
  id: string
  name: string
  plan: string
  domain: string
  color: string
  myRole: UiRole
  members: UiMember[]
  leads: UiLead[]
}

const ORG_COLORS = [
  "from-indigo-500 to-sky-500",
  "from-fuchsia-500 to-rose-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
  "from-violet-500 to-purple-500",
]

const uiRole = (role: Enums<"member_role">, isCreator: boolean): UiRole =>
  isCreator ? "Owner" : role === "admin" ? "Admin" : role === "viewer" ? "Viewer" : "Agent"

export function toUiLead(l: Tables<"leads">): UiLead {
  return {
    id: l.id,
    name: l.title,
    contact: l.contact_name ?? "",
    phone: l.phone ?? "",
    email: l.email ?? "",
    value: Number(l.value),
    stage: l.stage,
    owner: l.assignee_id,
    tags: l.tags,
    source: l.source ?? "",
    created: l.created_at.slice(0, 10),
    note: l.notes ?? "",
  }
}

export async function loadOrgs(supabase: SupabaseClient<Database>, userId: string): Promise<UiOrg[]> {
  const [orgsRes, membersRes, leadsRes, invitesRes] = await Promise.all([
    supabase.from("organizations").select("*").order("created_at"),
    supabase.from("memberships").select("*").order("created_at"),
    supabase.from("leads").select("*").order("position").order("created_at", { ascending: false }),
    // RLS returns rows only for orgs where the caller is admin
    supabase.from("invitations").select("*").is("accepted_at", null).gt("expires_at", new Date().toISOString()),
  ])

  const orgs = orgsRes.data ?? []
  const memberships = membersRes.data ?? []
  const leads = leadsRes.data ?? []
  const invites = invitesRes.data ?? []

  const userIds = [...new Set(memberships.map((m) => m.user_id))]
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("*").in("id", userIds)
    : { data: [] as Tables<"profiles">[] }
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]))

  return orgs.map((org, i) => {
    const members: UiMember[] = memberships
      .filter((m) => m.org_id === org.id)
      .map((m, idx) => {
        const p = profileById.get(m.user_id)
        const email = p?.email ?? ""
        return {
          id: m.user_id,
          name: p?.full_name || email.split("@")[0] || "משתמש",
          email,
          role: uiRole(m.role, m.user_id === org.created_by),
          status: "active" as const,
          color: idx,
        }
      })

    const pending: UiMember[] = invites
      .filter((inv) => inv.org_id === org.id)
      .map((inv, idx) => ({
        id: `inv_${inv.id}`,
        inviteId: inv.id,
        name: inv.email.split("@")[0],
        email: inv.email,
        role: uiRole(inv.role, false),
        status: "pending" as const,
        color: members.length + idx,
      }))

    const mine = memberships.find((m) => m.org_id === org.id && m.user_id === userId)

    return {
      id: org.id,
      name: org.name,
      plan: org.plan,
      domain: org.domain ?? "",
      color: org.color ?? ORG_COLORS[i % ORG_COLORS.length],
      myRole: mine ? uiRole(mine.role, org.created_by === userId) : "Viewer",
      members: [...members, ...pending],
      leads: leads.filter((l) => l.org_id === org.id).map(toUiLead),
    }
  })
}
