"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { env } from "@/lib/env"

export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim()
  const next = String(formData.get("next") ?? "/dashboard")
  if (!email) redirect("/login?error=missing-email")

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${env.siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  })

  redirect(error ? "/login?error=send-failed" : "/login?sent=1")
}
