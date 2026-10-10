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
  auto_birthday_email: boolean
  auto_service_reminder: boolean
  booking_enabled: boolean
  booking_headline: string | null
  booking_slot_minutes: number
  booking_buffer_minutes: number
  booking_min_notice_hours: number
  booking_max_days: number
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
  birthday: string | null
  service_interval_months: number | null
  last_service_at: string | null
}

type ReminderLog = {
  created_at: string
  id: string
  kind: "birthday" | "service"
  lead_id: string
  org_id: string
  sent_for: string
}

export type DueReminder = {
  kind: "birthday" | "service"
  lead_id: string
  email: string
  contact_name: string | null
  lead_title: string
  org_name: string
  due: string
}

type Service = {
  color: string
  created_at: string
  description: string | null
  duration_minutes: number
  id: string
  is_active: boolean
  name: string
  org_id: string
  position: number
  price: number
  questions: Json
  updated_at: string
}

type AvailabilityRule = { end_time: string; id: string; org_id: string; start_time: string; weekday: number }
type AvailabilityBlock = { created_at: string; ends_on: string; id: string; org_id: string; reason: string | null; starts_on: string }

type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled" | "no_show"

type Appointment = {
  address: string | null
  answers: Json
  assignee_id: string | null
  created_at: string
  created_by: string | null
  customer_name: string
  email: string | null
  ends_at: string
  google_event_id: string | null
  id: string
  lead_id: string | null
  notes: string | null
  org_id: string
  phone: string | null
  price: number
  service_id: string | null
  source: "booking_page" | "whatsapp_bot" | "manual"
  starts_at: string
  status: AppointmentStatus
  sync_status: "none" | "pending" | "synced" | "error"
  synced_at: string | null
  updated_at: string
}

type CalendarConnection = {
  account_email: string | null
  calendar_id: string
  created_at: string
  id: string
  last_error: string | null
  last_synced_at: string | null
  org_id: string
  provider: "google"
  status: "pending" | "active" | "error" | "revoked"
  sync_direction: "push" | "pull" | "two_way"
  sync_token: string | null
  user_id: string | null
  watch_channel_id: string | null
  watch_expires_at: string | null
  watch_resource_id: string | null
}

type ExternalBusy = { connection_id: string; ends_at: string; external_event_id: string; id: string; org_id: string; starts_at: string }

type NotificationJob = {
  appointment_id: string
  attempts: number
  automation_id: string | null
  channel: "whatsapp" | "email"
  created_at: string
  error: string | null
  id: string
  kind: "confirmation" | "reminder"
  org_id: string
  provider: string | null
  provider_message_id: string | null
  send_at: string
  sent_at: string | null
  status: "queued" | "sending" | "sent" | "simulated" | "failed" | "skipped"
}

export type NotificationJobClaim = {
  job_id: string
  channel: "whatsapp" | "email"
  kind: "confirmation" | "reminder"
  phone: string | null
  email: string | null
  customer_name: string
  service_name: string
  starts_at: string
  address: string | null
  org_name: string
  template: string | null
  subject: string | null
}

export type BookingResult = {
  id: string
  starts_at: string
  ends_at: string
  price: number
  service: string
  org_name: string
  channels: ("whatsapp" | "email")[]
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
  key: string | null
  trigger_event: "lead_created" | "stage_changed" | "appointment_booked" | "message_received"
}

type BotSettings = {
  org_id: string
  is_enabled: boolean
  whatsapp_phone_number_id: string | null
  whatsapp_display_phone: string | null
  handoff_keywords: string[]
  restart_keywords: string[]
  updated_at: string
}
type BotScript = { id: string; org_id: string; key: string; body: string; updated_at: string }
type BotFaq = { id: string; org_id: string; question: string; answer: string; keywords: string[]; is_active: boolean; position: number; created_at: string }
type BotMenuItem = {
  id: string
  org_id: string
  label: string
  description: string | null
  action: "book" | "faqs" | "faq" | "handoff" | "reply"
  faq_id: string | null
  reply: string | null
  is_active: boolean
  position: number
  created_at: string
}
type BotConversation = {
  id: string
  org_id: string
  wa_id: string
  contact_name: string | null
  lead_id: string | null
  state: "WELCOME" | "FAQ" | "SERVICE_SELECT" | "SERVICE_QUESTIONS" | "DATE_SELECT" | "TIME_SELECT" | "ADDRESS" | "CONFIRM" | "CONFIRMED"
  mode: "bot" | "manual_agent"
  context: Json
  version: number
  assigned_to: string | null
  unread: number
  last_message_at: string
  last_inbound_at: string | null
  created_at: string
}
type BotConversationMessage = {
  id: string
  org_id: string
  conversation_id: string
  direction: "inbound" | "outbound"
  sender: "customer" | "bot" | "agent"
  body: string
  payload: Json | null
  wa_message_id: string | null
  status: "received" | "queued" | "sent" | "delivered" | "read" | "simulated" | "failed"
  error: string | null
  sender_id: string | null
  created_at: string
}

export type CalendarPendingEvent = {
  appointment_id: string
  org_id: string
  status: AppointmentStatus
  google_event_id: string | null
  starts_at: string
  ends_at: string
  customer_name: string
  phone: string | null
  address: string | null
  notes: string | null
  service_name: string | null
  answers: Json
  org_name: string
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
      reminder_log: Table<ReminderLog, "org_id" | "lead_id" | "kind" | "sent_for">
      services: Table<Service, "org_id" | "name">
      availability_rules: Table<AvailabilityRule, "org_id" | "weekday" | "start_time" | "end_time">
      availability_blocks: Table<AvailabilityBlock, "org_id" | "starts_on" | "ends_on">
      appointments: Table<Appointment, "org_id" | "customer_name" | "starts_at" | "ends_at">
      calendar_connections: Table<CalendarConnection, "org_id">
      external_busy: Table<ExternalBusy, "org_id" | "connection_id" | "external_event_id" | "starts_at" | "ends_at">
      notification_jobs: Table<NotificationJob, "org_id" | "appointment_id" | "channel" | "kind" | "send_at">
      bot_settings: Table<BotSettings, "org_id">
      bot_scripts: Table<BotScript, "org_id" | "key" | "body">
      bot_faqs: Table<BotFaq, "org_id" | "question" | "answer">
      bot_menu_items: Table<BotMenuItem, "org_id" | "label" | "action">
      bot_conversations: Table<BotConversation, "org_id" | "wa_id">
      bot_conversation_messages: Table<BotConversationMessage, "org_id" | "conversation_id" | "direction" | "sender">
    }
    Views: { [_ in never]: never }
    Functions: {
      accept_invitation: { Args: { _token: string }; Returns: string }
      create_organization: { Args: { _name: string; _slug: string }; Returns: Organization }
      claim_due_reminders: { Args: { _secret: string }; Returns: DueReminder[] }
      get_booking_page: { Args: { _slug: string }; Returns: Json }
      get_booking_slots: {
        Args: { _slug: string; _service: string; _answers?: Json; _from?: string | null; _days?: number }
        Returns: { slot_start: string; slot_end: string }[]
      }
      book_appointment: {
        Args: {
          _slug: string
          _service: string
          _starts_at: string
          _answers: Json
          _name: string
          _phone: string
          _email?: string | null
          _address?: string | null
          _notes?: string | null
          _source?: string
        }
        Returns: Json
      }
      claim_notification_jobs: {
        Args: { _secret: string; _lookahead_minutes?: number; _appointment?: string | null }
        Returns: NotificationJobClaim[]
      }
      finish_notification_jobs: { Args: { _secret: string; _results: Json }; Returns: number }
      bot_ingest: {
        Args: { _secret: string; _phone_number_id: string; _wa_id: string; _name: string | null; _wa_message_id: string; _body: string; _payload?: Json | null }
        Returns: Json
      }
      bot_save_turn: {
        Args: { _secret: string; _conversation: string; _expected_version: number | null; _state: string; _mode: string; _context: Json; _outgoing?: Json; _appointment?: string | null }
        Returns: Json
      }
      bot_update_messages: { Args: { _secret: string; _updates: Json }; Returns: number }
      calendar_store_connection: {
        Args: { _secret: string; _org: string; _user: string; _email: string | null; _calendar_id: string; _refresh_token: string; _access_token: string; _expires_at: string }
        Returns: string
      }
      calendar_get_access: {
        Args: { _secret: string; _org: string }
        Returns: { connection_id: string; calendar_id: string; refresh_token: string; access_token: string | null; expires_at: string | null }[]
      }
      calendar_save_access: {
        Args: { _secret: string; _connection: string; _access_token: string | null; _expires_at: string | null; _error?: string | null }
        Returns: undefined
      }
      calendar_pending_events: { Args: { _secret: string; _appointment?: string | null; _limit?: number }; Returns: CalendarPendingEvent[] }
      calendar_mark_synced: { Args: { _secret: string; _appointment: string; _event_id: string | null; _error?: string | null }; Returns: undefined }
    }
    Enums: { lead_stage: LeadStage; member_role: MemberRole }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"]
export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T]

export const LEAD_STAGES = ["new", "in_progress", "proposal", "won", "lost"] as const satisfies readonly LeadStage[]
export const MEMBER_ROLES = ["admin", "agent", "viewer"] as const satisfies readonly MemberRole[]
