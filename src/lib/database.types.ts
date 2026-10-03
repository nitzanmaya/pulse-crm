// Generated from Supabase project gwdjwmoiyoklknuicuax.
// Regenerate: npx supabase gen types typescript --project-id gwdjwmoiyoklknuicuax > src/lib/database.types.ts
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type MemberRole = "admin" | "agent" | "viewer"
type LeadStage = "new" | "in_progress" | "proposal" | "won" | "lost"

type Organization = {
  created_at: string
  created_by: string | null
  id: string
  logo_url: string | null
  name: string
  slug: string
  plan: "Starter" | "Pro" | "Business"
  domain: string | null
  color: string | null
}

type Lead = {
  assignee_id: string | null
  company: string | null
  contact_name: string | null
  created_at: string
  created_by: string | null
  currency: string
  email: string | null
  id: string
  notes: string | null
  org_id: string
  phone: string | null
  position: number
  source: string | null
  stage: LeadStage
  tags: string[]
  title: string
  updated_at: string
  value: number
}

type Invitation = {
  accepted_at: string | null
  created_at: string
  email: string
  expires_at: string
  id: string
  invited_by: string | null
  org_id: string
  role: MemberRole
  token: string
}

type Membership = { created_at: string; org_id: string; role: MemberRole; user_id: string }
type Profile = { avatar_url: string | null; created_at: string; email: string | null; full_name: string | null; id: string }

type Message = {
  channel: "whatsapp" | "sms" | "email" | "instagram" | "facebook" | "web_form" | "note"
  content: string
  created_at: string
  direction: "inbound" | "outbound"
  id: string
  lead_id: string
  org_id: string
  sender_id: string | null
}

type Automation = {
  action_type: "send_whatsapp" | "send_sms" | "send_email" | "assign_round_robin" | "add_tag" | "stop_followup"
  config: Json
  created_at: string
  created_by: string | null
  id: string
  is_active: boolean
  name: string
  org_id: string
  trigger_event: "lead_created" | "stage_changed" | "appointment_booked" | "message_received"
}

type Table<R, Required extends keyof R> = {
  Row: R
  Insert: Partial<R> & Pick<R, Required>
  Update: Partial<R>
  Relationships: []
}

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" }
  public: {
    Tables: {
      organizations: Table<Organization, "name" | "slug">
      memberships: Table<Membership, "org_id" | "user_id">
      invitations: Table<Invitation, "email" | "org_id">
      leads: Table<Lead, "org_id" | "title">
      profiles: Table<Profile, "id">
      messages: Table<Message, "org_id" | "lead_id" | "channel" | "direction" | "content">
      automations: Table<Automation, "org_id" | "name" | "trigger_event" | "action_type">
    }
    Views: { [_ in never]: never }
    Functions: {
      accept_invitation: { Args: { _token: string }; Returns: string }
      create_organization: { Args: { _name: string; _slug: string }; Returns: Organization }
    }
    Enums: { lead_stage: LeadStage; member_role: MemberRole }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"]
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T]

export const LEAD_STAGES = ["new", "in_progress", "proposal", "won", "lost"] as const satisfies readonly LeadStage[]
export const MEMBER_ROLES = ["admin", "agent", "viewer"] as const satisfies readonly MemberRole[]
