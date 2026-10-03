"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export async function createOrganization(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim()
  const slug = String(formData.get("slug") ?? "").trim().toLowerCase()

  const supabase = await createClient()
  const { error } = await supabase.rpc("create_organization", { _name: name, _slug: slug })
  redirect(error ? "/onboarding?error=1" : "/dashboard")
}
