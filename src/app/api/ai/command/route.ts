import { NextRequest } from "next/server";
import { z } from "zod";
import { authed, dbError, fail, ok } from "@/lib/api";
import { generateCommandJson } from "@/lib/gemini";
import { businessValidate, commandOutputSchema } from "@/lib/ai/schema";
import { checkResolutions } from "@/lib/ai/apply";
import { FREE_LIMITS, getUsage } from "@/lib/billing";

const bodySchema = z.object({
  text: z.string().trim().min(2, "Command is too short").max(1000),
  workspace_id: z.string().uuid(),
});

/**
 * POST /api/ai/command — parse natural language into the JSON contract.
 * The AI NEVER writes to the database here: the output is validated and
 * stored inert; writes happen only via the separate apply endpoint.
 */
export async function POST(req: NextRequest) {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const body = await req.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(body);
  if (!parsedBody.success) {
    return fail("VALIDATION_ERROR", parsedBody.error.issues[0]?.message ?? "Invalid input");
  }
  const { text, workspace_id: workspaceId } = parsedBody.data;

  // ── Free-tier rate guards (DB-based, no extra services) ──
  try {
    // Monthly usage cap (Phase 5 usage limits)
    const usage = await getUsage(auth.supabase, workspaceId);
    if (usage.ai_requests >= FREE_LIMITS.ai_requests) {
      return fail(
        "USAGE_LIMIT",
        `Monthly AI limit reached (${FREE_LIMITS.ai_requests} commands). Resets on the 1st (UTC) — or upgrade via Settings → Billing (Stripe test mode).`,
        429
      );
    }

    const minuteAgo = new Date(Date.now() - 60_000).toISOString();
    const [{ count: recent }, { count: today }] = await Promise.all([
      auth.supabase
        .from("ai_commands")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .gte("created_at", minuteAgo),
      auth.supabase
        .from("ai_commands")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .gte("created_at", new Date(new Date().setUTCHours(0, 0, 0, 0)).toISOString()),
    ]);
    if ((recent ?? 0) >= 6) {
      return fail("RATE_LIMITED", "Slow down — max 6 AI commands per minute on the free tier.", 429);
    }
    if ((today ?? 0) >= 150) {
      return fail("DAILY_LIMIT", "Daily AI budget reached (150 commands). Resets at midnight UTC.", 429);
    }
  } catch (e) {
    return fail("DB_ERROR", (e as Error).message, 500);
  }

  // ── Gemini (server-side key, free Flash tier) ──
  const gemini = await generateCommandJson(text);
  if (!gemini.ok) {
    const status =
      gemini.code === "GEMINI_KEY_MISSING" ? 500
      : gemini.code === "GEMINI_RATE_LIMITED" ? 429
      : 502;
    return fail(gemini.code, gemini.message, status);
  }

  // Count the successful AI request against the monthly quota.
  await auth.supabase.rpc("bump_usage", {
    p_workspace_id: workspaceId,
    p_counter: "ai_requests",
  });

  // ── Validate the model output (structural, then business rules) ──
  let parsedJson: unknown;
  let structuralError: string | null = null;
  try {
    parsedJson = JSON.parse(gemini.jsonText);
  } catch {
    structuralError = "AI returned malformed JSON.";
  }

  const parsed = structuralError
    ? null
    : commandOutputSchema.safeParse(parsedJson);

  const errors: string[] = structuralError
    ? [structuralError]
    : !parsed || !parsed.success
      ? [`AI output failed schema validation: ${parsed?.error?.issues?.[0]?.message ?? "unknown"}`]
      : businessValidate(parsed.data).map((i) => i.message);

  const command = parsed?.success ? parsed.data : null;
  const valid = command !== null && errors.length === 0 && command.understood && command.intents.length > 0;

  // ── Resolve lead references for the preview (read-only) ──
  let preview: unknown[] = [];
  if (command) {
    try {
      const check = await checkResolutions(
        auth.supabase,
        workspaceId,
        command,
        new Map()
      );
      preview = check.preview;
    } catch (e) {
      errors.push((e as Error).message);
    }
  }

  // ── Persist the (inert) command for audit + apply ──
  const { data: row, error: insertErr } = await auth.supabase
    .from("ai_commands")
    .insert({
      workspace_id: workspaceId,
      user_id: auth.user.id,
      raw_text: text,
      model: gemini.model,
      parsed: command ?? parsedJson ?? null,
      valid: errors.length === 0 && command !== null,
      validation_errors: errors,
      latency_ms: gemini.latencyMs,
      tokens_used: gemini.tokens,
    })
    .select("id")
    .single();
  if (insertErr) return dbError(insertErr);

  return ok({
    command_id: row.id as string,
    understood: command?.understood ?? false,
    clarification: command?.clarification ?? "",
    valid,
    errors,
    preview,
    model: gemini.model,
    latency_ms: gemini.latencyMs,
    tokens: gemini.tokens,
  });
}

/** GET /api/ai/commands — recent command history (audit trail) */
export async function GET(req: NextRequest) {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const workspaceId = req.nextUrl.searchParams.get("workspace_id");
  if (!workspaceId || !z.string().uuid().safeParse(workspaceId).success) {
    return fail("VALIDATION_ERROR", "workspace_id (uuid) is required.");
  }

  const { data, error } = await auth.supabase
    .from("ai_commands")
    .select("id, raw_text, model, valid, applied, validation_errors, created_at, latency_ms, tokens_used")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return dbError(error);

  return ok(data ?? []);
}
