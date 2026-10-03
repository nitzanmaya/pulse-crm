import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sendInviteEmail } from "@/lib/email/invite"
import { MEMBER_ROLES } from "@/lib/database.types"

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const orgId = body?.orgId as string | undefined
  const email = String(body?.email ?? "").trim().toLowerCase()
  const role = MEMBER_ROLES.includes(body?.role) ? (body.role as (typeof MEMBER_ROLES)[number]) : "agent"

  if (!orgId || !email) {
    return NextResponse.json({ error: "orgId and email are required" }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  const userId = claims?.claims.sub
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  // RLS only lets org admins insert invitations
  const { data: invite, error } = await supabase
    .from("invitations")
    .insert({ org_id: orgId, email, role, invited_by: userId })
    .select("id, token, organizations(name)")
    .single()

  if (error || !invite) {
    return NextResponse.json({ error: error?.message ?? "could not create invitation" }, { status: 403 })
  }

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", userId).single()
  const org = invite.organizations as unknown as { name: string } | null

  const { error: sendError } = await sendInviteEmail({
    to: email,
    orgName: org?.name ?? "הארגון",
    inviterName: profile?.full_name ?? (claims.claims.email as string) ?? "חבר צוות",
    role,
    token: invite.token,
  })

  if (sendError) return NextResponse.json({ error: sendError.message }, { status: 502 })
  return NextResponse.json({ ok: true, id: invite.id })
}
