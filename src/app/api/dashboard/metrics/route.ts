import { NextRequest } from "next/server";
import { z } from "zod";
import { authed, fail, ok } from "@/lib/api";
import { getDashboard } from "@/lib/queries";

const querySchema = z.object({
  workspace_id: z.string().uuid(),
});

/** GET /api/dashboard/metrics?workspace_id= — KPI metrics + lists (from SQL views) */
export async function GET(req: NextRequest) {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const parsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "workspace_id (uuid) is required.");
  }

  try {
    const dashboard = await getDashboard(auth.supabase, parsed.data.workspace_id);
    return ok(dashboard);
  } catch (e) {
    return fail("DB_ERROR", (e as Error).message, 500);
  }
}
