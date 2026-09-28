import { NextRequest } from "next/server";
import { authed, dbError, fail, ok } from "@/lib/api";
import { getLead } from "@/lib/queries";
import { whatsappSendSchema } from "@/lib/validate";
import {
  getWhatsAppConfig,
  isRecipientAllowed,
  normalizePhone,
  sendWhatsAppText,
} from "@/lib/whatsapp";
import { FREE_LIMITS, getUsage } from "@/lib/billing";

/**
 * POST /api/whatsapp/send — send a text message to a lead.
 * Sandbox guard chain (all must pass):
 *   1. authenticated + lead visible via RLS
 *   2. WhatsApp env credentials configured
 *   3. recipient in WHATSAPP_ALLOWED_RECIPIENTS (fail-closed allowlist)
 *   4. lead has an opted_in consent row
 */
export async function POST(req: NextRequest) {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const body = await req.json().catch(() => null);
  const parsed = whatsappSendSchema.safeParse(body);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const cfg = getWhatsAppConfig();
  if (!cfg) {
    return fail(
      "WHATSAPP_NOT_CONFIGURED",
      "WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID are not set on the server (see SETUP.md §11).",
      500
    );
  }

  let lead;
  try {
    lead = await getLead(auth.supabase, parsed.data.lead_id);
  } catch (e) {
    return fail("DB_ERROR", (e as Error).message, 500);
  }
  if (!lead) return fail("NOT_FOUND", "Lead not found.", 404);

  const digits = normalizePhone(lead.phone);
  if (!digits) {
    return fail("NO_PHONE", "This lead has no phone number.", 422);
  }

  // ── Sandbox guard: hard allowlist, fail-closed ──
  if (!isRecipientAllowed(digits, cfg.allowedRecipients)) {
    return fail(
      "RECIPIENT_NOT_ALLOWLISTED",
      "Sandbox guard: this number is not in WHATSAPP_ALLOWED_RECIPIENTS. Only whitelisted Meta test recipients can be messaged — this prevents touching real numbers.",
      403
    );
  }

  // ── Consent guard (scoped: this workspace's rows, or global rows
  //    recorded before workspace matching) ──
  const { data: optin, error: optErr } = await auth.supabase
    .from("whatsapp_optins")
    .select("status")
    .eq("phone", digits)
    .or(`workspace_id.eq.${lead.workspace_id},workspace_id.is.null`)
    .maybeSingle();
  if (optErr) return dbError(optErr);
  if (!optin || optin.status !== "opted_in") {
    return fail(
      "NO_OPT_IN",
      "This lead has not opted in to WhatsApp messages. Record consent first (they message you, reply STOP-undo, or mark opt-in manually).",
      403
    );
  }

  // ── Monthly usage cap (Phase 5 usage limits) ──
  try {
    const usage = await getUsage(auth.supabase, lead.workspace_id);
    if (usage.whatsapp_sends >= FREE_LIMITS.whatsapp_sends) {
      return fail(
        "USAGE_LIMIT",
        `Monthly WhatsApp send limit reached (${FREE_LIMITS.whatsapp_sends}). Resets on the 1st (UTC).`,
        429
      );
    }
  } catch (e) {
    return fail("DB_ERROR", (e as Error).message, 500);
  }

  // ── Send ──
  const result = await sendWhatsAppText(cfg, digits, parsed.data.body);
  if (!result.ok) {
    return fail(result.code, result.message, 502);
  }

  await auth.supabase.rpc("bump_usage", {
    p_workspace_id: lead.workspace_id,
    p_counter: "whatsapp_sends",
  });

  const { error: insErr } = await auth.supabase.from("whatsapp_messages").insert({
    workspace_id: lead.workspace_id,
    lead_id: lead.id,
    direction: "outbound",
    body: parsed.data.body,
    status: "sent",
    wa_message_id: result.wamid,
    sent_at: new Date().toISOString(),
  });
  if (insErr) return dbError(insErr);

  await auth.supabase
    .from("leads")
    .update({ last_contacted_at: new Date().toISOString() })
    .eq("id", lead.id);

  return ok({ wamid: result.wamid }, 201);
}
