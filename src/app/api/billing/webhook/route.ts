import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/billing";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/billing/webhook — Stripe webhook (TEST mode).
 * Signature is verified with the RAW body (never parsed JSON).
 * Local dev: `stripe listen --forward-to localhost:3000/api/billing/webhook`
 * and put the printed whsec_ into STRIPE_WEBHOOK_SECRET.
 */
export async function POST(req: NextRequest) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json(
      { error: { code: "STRIPE_NOT_CONFIGURED", message: "Stripe test key or webhook secret missing." } },
      { status: 500 }
    );
  }

  const raw = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: { code: "NO_SIGNATURE", message: "Missing stripe-signature header." } },
      { status: 400 }
    );
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (e) {
    return NextResponse.json(
      { error: { code: "BAD_SIGNATURE", message: (e as Error).message } },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: { code: "SERVICE_KEY_MISSING", message: "SUPABASE_SERVICE_ROLE_KEY missing." } },
      { status: 500 }
    );
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as {
        metadata?: { workspace_id?: string };
        subscription?: string | null;
        customer?: string;
      };
      const wsId = session.metadata?.workspace_id;
      if (wsId) {
        await admin
          .from("workspaces")
          .update({
            plan: "pro",
            billing_status: "active_test",
            stripe_subscription_id: session.subscription ?? null,
            stripe_customer_id: session.customer ?? undefined,
          })
          .eq("id", wsId);
      }
    } else if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as { id?: string };
      if (sub.id) {
        await admin
          .from("workspaces")
          .update({ plan: "free", billing_status: "canceled_test" })
          .eq("stripe_subscription_id", sub.id);
      }
    }
  } catch (e) {
    console.error("[billing-webhook]", (e as Error).message);
  }

  return NextResponse.json({ received: true });
}
