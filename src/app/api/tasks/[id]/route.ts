import { NextRequest, NextResponse } from "next/server";
import { authed, dbError, fail, ok } from "@/lib/api";
import { taskUpdateSchema, normalizePatch } from "@/lib/validate";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/tasks/:id — complete / reopen / reschedule / re-prioritize */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = taskUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const row = normalizePatch(parsed.data as Record<string, unknown>);
  // keep completed_at in sync with status transitions
  if (parsed.data.status === "completed") row.completed_at = new Date().toISOString();
  if (parsed.data.status && parsed.data.status !== "completed") row.completed_at = null;

  const { data, error } = await auth.supabase
    .from("tasks")
    .update(row)
    .eq("id", id)
    .select()
    .single();
  if (error) return dbError(error);
  return ok(data);
}

/** DELETE /api/tasks/:id */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const { id } = await ctx.params;
  const { error } = await auth.supabase.from("tasks").delete().eq("id", id);
  if (error) return dbError(error);
  return new NextResponse(null, { status: 204 });
}
