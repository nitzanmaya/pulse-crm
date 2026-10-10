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
  birthday: string
  serviceMonths: number | null
  lastService: string
}

export type UiBooking = {
  enabled: boolean
  headline: string
  slotMinutes: number
  bufferMinutes: number
  minNoticeHours: number
  maxDays: number
}

export type UiOrg = {
  id: string
  slug: string
  name: string
  plan: string
  domain: string
  color: string
  autoBirthday: boolean
  autoService: boolean
  myRole: UiRole
  members: UiMember[]
  leads: UiLead[]
  booking: UiBooking
  services: Tables<"services">[]
  rules: Pick<Tables<"availability_rules">, "weekday" | "start_time" | "end_time">[]
  blocks: Tables<"availability_blocks">[]
  appointments: Tables<"appointments">[]
  automations: Tables<"automations">[]
  jobs: Tables<"notification_jobs">[]
  calendars: Pick<Tables<"calendar_connections">, "id" | "provider" | "account_email" | "calendar_id" | "status" | "last_synced_at" | "last_error">[]
  bot: UiBot
}

export type UiBot = {
  settings: Tables<"bot_settings"> | null
  scripts: Record<string, string>
  faqs: Tables<"bot_faqs">[]
  menu: Tables<"bot_menu_items">[]
}

export type Providers = { whatsapp: "meta" | "simulated"; webhook: boolean; appSecret: boolean; verifyToken: boolean; email: boolean; google: boolean; cron: boolean }

export function providerStatus(): Providers {
  return {
    whatsapp: process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID ? "meta" : "simulated",
    // The bot needs the token, the app secret (signature) and the CRON_SECRET (DB access)
    webhook: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_APP_SECRET && process.env.CRON_SECRET),
    appSecret: Boolean(process.env.WHATSAPP_APP_SECRET),
    verifyToken: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
    email: Boolean(process.env.RESEND_API_KEY),
    google: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.CRON_SECRET),
    cron: Boolean(process.env.CRON_SECRET),
  }
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
    birthday: l.birthday ?? "",
    serviceMonths: l.service_interval_months,
    lastService: l.last_service_at ?? "",
  }
}

export async function loadOrgs(supabase: SupabaseClient<Database>, userId: string): Promise<UiOrg[]> {
  const since = new Date(Date.now() - 60 * 86400000).toISOString()
  const [orgsRes, membersRes, leadsRes, invitesRes, servicesRes, rulesRes, blocksRes, apptsRes, autoRes, jobsRes, calRes, botRes, scriptsRes, faqsRes, menuRes] = await Promise.all([
    supabase.from("organizations").select("*").order("created_at"),
    supabase.from("memberships").select("*").order("created_at"),
    supabase.from("leads").select("*").order("position").order("created_at", { ascending: false }),
    // RLS returns rows only for orgs where the caller is admin
    supabase.from("invitations").select("*").is("accepted_at", null).gt("expires_at", new Date().toISOString()),
    supabase.from("services").select("*").order("position").order("created_at"),
    supabase.from("availability_rules").select("org_id, weekday, start_time, end_time").order("weekday").order("start_time"),
    supabase.from("availability_blocks").select("*").gte("ends_on", new Date().toISOString().slice(0, 10)).order("starts_on"),
    supabase.from("appointments").select("*").gte("starts_at", since).order("starts_at").limit(2000),
    supabase.from("automations").select("*").order("created_at"),
    supabase.from("notification_jobs").select("*").order("created_at", { ascending: false }).limit(200),
    supabase.from("calendar_connections").select("id, org_id, provider, account_email, calendar_id, status, last_synced_at, last_error"),
    supabase.from("bot_settings").select("*"),
    supabase.from("bot_scripts").select("org_id, key, body"),
    supabase.from("bot_faqs").select("*").order("position").order("created_at"),
    supabase.from("bot_menu_items").select("*").order("position").order("created_at"),
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
      autoBirthday: org.auto_birthday_email,
      autoService: org.auto_service_reminder,
      myRole: mine ? uiRole(mine.role, org.created_by === userId) : "Viewer",
      members: [...members, ...pending],
      leads: leads.filter((l) => l.org_id === org.id).map(toUiLead),
      slug: org.slug,
      booking: {
        enabled: org.booking_enabled,
        headline: org.booking_headline ?? "",
        slotMinutes: org.booking_slot_minutes,
        bufferMinutes: org.booking_buffer_minutes,
        minNoticeHours: org.booking_min_notice_hours,
        maxDays: org.booking_max_days,
      },
      services: (servicesRes.data ?? []).filter((x) => x.org_id === org.id),
      rules: (rulesRes.data ?? []).filter((x) => x.org_id === org.id).map(({ weekday, start_time, end_time }) => ({ weekday, start_time, end_time })),
      blocks: (blocksRes.data ?? []).filter((x) => x.org_id === org.id),
      appointments: (apptsRes.data ?? []).filter((x) => x.org_id === org.id),
      automations: (autoRes.data ?? []).filter((x) => x.org_id === org.id),
      jobs: (jobsRes.data ?? []).filter((x) => x.org_id === org.id).slice(0, 40),
      calendars: (calRes.data ?? []).filter((x) => x.org_id === org.id),
      bot: {
        settings: (botRes.data ?? []).find((x) => x.org_id === org.id) ?? null,
        scripts: Object.fromEntries((scriptsRes.data ?? []).filter((x) => x.org_id === org.id).map((x) => [x.key, x.body])),
        faqs: (faqsRes.data ?? []).filter((x) => x.org_id === org.id),
        menu: (menuRes.data ?? []).filter((x) => x.org_id === org.id),
      },
    }
  })
}
