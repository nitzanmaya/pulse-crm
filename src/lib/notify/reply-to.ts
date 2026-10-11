import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/database.types"

// Looks up each business's reply-to address for outgoing emails, keyed by
// notification job id or lead id. A failed lookup returns an empty map, so
// callers fall back to env.emailReplyTo() and the email still goes out.
export async function replyToAddresses(
  supabase: SupabaseClient<Database>,
  secret: string,
  { jobIds = [], leadIds = [] }: { jobIds?: string[]; leadIds?: string[] },
) {
  const map = new Map<string, string>()
  if (!jobIds.length && !leadIds.length) return map
  const { data, error } = await supabase.rpc("reply_to_addresses", { _secret: secret, _job_ids: jobIds, _lead_ids: leadIds })
  if (error) {
    console.error("reply_to_addresses failed", error)
    return map
  }
  for (const row of data ?? []) if (row.reply_to) map.set(row.ref_id, row.reply_to)
  return map
}
