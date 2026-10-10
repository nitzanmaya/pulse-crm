import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { authUrl, googleConfigured, signState } from "@/lib/calendar/google"

// Starts the Google OAuth consent for an org (admins only)
export async function GET(request: NextRequest) {
  const back = new URL("/dashboard", request.url)
  if (!googleConfigured()) {
    back.searchParams.set("calendar", "not_configured")
    return NextResponse.redirect(back)
  }
  const org = request.nextUrl.searchParams.get("org") ?? ""
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims.sub
  if (!user) return NextResponse.redirect(new URL("/login?next=/dashboard", request.url))

  const { data: m } = await supabase.from("memberships").select("role").eq("org_id", org).eq("user_id", user).maybeSingle()
  if (m?.role !== "admin") {
    back.searchParams.set("calendar", "forbidden")
    return NextResponse.redirect(back)
  }
  return NextResponse.redirect(authUrl(signState({ org, user })))
}
