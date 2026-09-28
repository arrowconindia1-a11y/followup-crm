import { NextRequest } from "next/server";
import { z } from "zod";
import { authed, fail, ok } from "@/lib/api";
import { FREE_LIMITS, currentPeriodMonth, getUsage, getStripe, getPriceId } from "@/lib/billing";

const querySchema = z.object({ workspace_id: z.string().uuid() });

/** GET /api/usage?workspace_id= — this month's counters vs free limits */
export async function GET(req: NextRequest) {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const parsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries())
  );
  if (!parsed.success) return fail("VALIDATION_ERROR", "workspace_id (uuid) is required.");

  const { data: ws } = await auth.supabase
    .from("workspaces")
    .select("plan, billing_status")
    .eq("id", parsed.data.workspace_id)
    .maybeSingle();
  if (!ws) return fail("NOT_FOUND", "Workspace not found.", 404);

  let usage;
  try {
    usage = await getUsage(auth.supabase, parsed.data.workspace_id);
  } catch (e) {
    return fail("DB_ERROR", (e as Error).message, 500);
  }

  return ok({
    period_month: currentPeriodMonth(),
    usage,
    limits: FREE_LIMITS,
    plan: ws.plan ?? "free",
    billing_status: ws.billing_status ?? null,
    stripe_configured: getStripe() !== null && getPriceId() !== null,
  });
}
