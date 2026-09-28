import { NextRequest } from "next/server";
import { z } from "zod";
import { authed, dbError, fail, ok } from "@/lib/api";
import { getStripe, getPriceId } from "@/lib/billing";

const bodySchema = z.object({ workspace_id: z.string().uuid() });

/**
 * POST /api/billing/checkout — Stripe TEST-mode checkout for the
 * "pro" subscription. getStripe() rejects any non-test key.
 */
export async function POST(req: NextRequest) {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_ERROR", "workspace_id (uuid) is required.");

  const stripe = getStripe();
  if (!stripe) {
    return fail(
      "STRIPE_NOT_CONFIGURED",
      "STRIPE_SECRET_KEY is not set or is not a test key (must start with sk_test_). Test mode only.",
      500
    );
  }
  const priceId = getPriceId();
  if (!priceId) {
    return fail("STRIPE_NOT_CONFIGURED", "STRIPE_PRICE_ID is not set (see SETUP.md §12).", 500);
  }

  // owner/admin only
  const { data: me } = await auth.supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", parsed.data.workspace_id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!me || (me.role !== "owner" && me.role !== "admin")) {
    return fail("FORBIDDEN", "Only owners and admins manage billing.", 403);
  }

  const { data: ws, error: wsErr } = await auth.supabase
    .from("workspaces")
    .select("id, name, stripe_customer_id")
    .eq("id", parsed.data.workspace_id)
    .maybeSingle();
  if (wsErr) return dbError(wsErr);
  if (!ws) return fail("NOT_FOUND", "Workspace not found.", 404);

  try {
    let customerId = ws.stripe_customer_id as string | null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: auth.user.email ?? undefined,
        name: ws.name as string,
        metadata: { workspace_id: ws.id as string },
      });
      customerId = customer.id;
      const { error: upErr } = await auth.supabase
        .from("workspaces")
        .update({ stripe_customer_id: customerId })
        .eq("id", ws.id);
      if (upErr) return dbError(upErr);
    }

    const origin = req.nextUrl.origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/settings?billing=success`,
      cancel_url: `${origin}/settings?billing=cancelled`,
      metadata: { workspace_id: ws.id as string },
      subscription_data: { metadata: { workspace_id: ws.id as string } },
    });

    return ok({ url: session.url });
  } catch (e) {
    return fail("STRIPE_ERROR", (e as Error).message, 502);
  }
}
