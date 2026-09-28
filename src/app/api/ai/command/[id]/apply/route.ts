import { NextRequest } from "next/server";
import { z } from "zod";
import { authed, dbError, fail, ok } from "@/lib/api";
import { businessValidate, commandOutputSchema } from "@/lib/ai/schema";
import { checkResolutions, executeIntents } from "@/lib/ai/apply";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  resolutions: z
    .array(z.object({ index: z.number().int().min(0).max(4), lead_id: z.string().uuid() }))
    .max(5)
    .default([]),
});

/**
 * POST /api/ai/command/:id/apply — the ONLY path from AI output to DB writes.
 * Re-fetches the stored parsed JSON, re-runs zod + business validation,
 * re-resolves every lead, and refuses to run if anything is unresolved.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(body ?? {});
  if (!parsedBody.success) {
    return fail("VALIDATION_ERROR", parsedBody.error.issues[0]?.message ?? "Invalid input");
  }

  const { data: row, error: rowErr } = await auth.supabase
    .from("ai_commands")
    .select("id, workspace_id, parsed, valid, applied")
    .eq("id", id)
    .maybeSingle();
  if (rowErr) return dbError(rowErr);
  if (!row) return fail("NOT_FOUND", "Command not found.", 404);
  if (row.applied) return fail("ALREADY_APPLIED", "This command was already applied.", 409);
  if (!row.valid) return fail("NOT_VALID", "This command failed validation and cannot be applied.", 422);

  // Re-validate the stored parsed JSON from scratch — never trust it.
  const revalidated = commandOutputSchema.safeParse(row.parsed);
  if (!revalidated.success) {
    return fail("NOT_VALID", "Stored AI output no longer passes validation.", 422);
  }
  const issues = businessValidate(revalidated.data);
  if (issues.length > 0) {
    return fail("NOT_VALID", issues.map((i) => i.message).join(" "), 422);
  }
  if (!revalidated.data.understood || revalidated.data.intents.length === 0) {
    return fail("NOT_VALID", "Nothing to apply.", 422);
  }

  // Re-resolve leads (with any user picks for ambiguous matches).
  const picks = new Map(parsedBody.data.resolutions.map((r) => [r.index, r.lead_id]));
  let check;
  try {
    check = await checkResolutions(
      auth.supabase,
      row.workspace_id as string,
      revalidated.data,
      picks
    );
  } catch (e) {
    return fail("DB_ERROR", (e as Error).message, 500);
  }
  if (check.blocked.length > 0) {
    return fail(
      "UNRESOLVED",
      check.blocked.map((b) => `Intent ${b.index + 1}: ${b.reason}`).join(" "),
      422
    );
  }

  // Execute (all pre-checks passed).
  const outcomes = await executeIntents(
    auth.supabase,
    { workspaceId: row.workspace_id as string, userId: auth.user.id },
    revalidated.data,
    check.resolvedLeads
  );

  const { error: markErr } = await auth.supabase
    .from("ai_commands")
    .update({
      applied: true,
      applied_at: new Date().toISOString(),
      applied_results: outcomes,
    })
    .eq("id", id);
  if (markErr) return dbError(markErr);

  const anyFailed = outcomes.some((o) => !o.ok);
  return ok({ results: outcomes }, anyFailed ? 207 : 200);
}
