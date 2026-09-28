import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client — ONLY for the WhatsApp webhook, which runs
 * without a user session (Meta's servers call it). Server-only:
 * SUPABASE_SERVICE_ROLE_KEY must never be exposed via NEXT_PUBLIC_*.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
