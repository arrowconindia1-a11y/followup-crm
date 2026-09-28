import { NextRequest, NextResponse } from "next/server";
import { authed, dbError, fail, ok } from "@/lib/api";
import { getLead, updateLead, deleteLead } from "@/lib/queries";
import { leadUpdateSchema } from "@/lib/validate";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/leads/:id */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const { id } = await ctx.params;
  try {
    const lead = await getLead(auth.supabase, id);
    if (!lead) return fail("NOT_FOUND", "Lead not found.", 404);
    return ok(lead);
  } catch (e) {
    return fail("DB_ERROR", (e as Error).message, 500);
  }
}

/** PATCH /api/leads/:id — partial update (status, follow-up, fields…) */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = leadUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid input"
    );
  }

  try {
    const lead = await updateLead(auth.supabase, id, parsed.data);
    return ok(lead);
  } catch (e) {
    return dbError(e as { code?: string; message: string });
  }
}

/** DELETE /api/leads/:id */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const { id } = await ctx.params;
  try {
    await deleteLead(auth.supabase, id);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return dbError(e as { code?: string; message: string });
  }
}
