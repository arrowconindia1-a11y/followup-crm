import Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Stripe — TEST MODE ONLY (Phase 5).
 * Hard guard: only keys starting with `sk_test_` are accepted, so a
 * live key cannot be used by accident. Test mode is free & unlimited
 * (companion doc §3.1). Go-live is a deliberate later decision.
 */

let stripeClient: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !key.startsWith("sk_test_")) return null;
  if (!stripeClient) stripeClient = new Stripe(key);
  return stripeClient;
}

export function getPriceId(): string | null {
  return process.env.STRIPE_PRICE_ID || null;
}

/** Free-plan monthly ceilings (companion §19 upgrade triggers). */
export const FREE_LIMITS = {
  ai_requests: 500, // Gemini free tier headroom for a small team
  whatsapp_sends: 1000, // mirrors Meta's 1,000 free conversations/mo
} as const;

export function currentPeriodMonth(): string {
  // first day of the current month (UTC), YYYY-MM-01
  return `${new Date().toISOString().slice(0, 7)}-01`;
}

export async function getUsage(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<{ ai_requests: number; whatsapp_sends: number }> {
  const { data, error } = await supabase
    .from("usage_counters")
    .select("ai_requests, whatsapp_sends")
    .eq("workspace_id", workspaceId)
    .eq("period_month", currentPeriodMonth())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return {
    ai_requests: data?.ai_requests ?? 0,
    whatsapp_sends: data?.whatsapp_sends ?? 0,
  };
}
