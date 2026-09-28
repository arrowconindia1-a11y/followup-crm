import { NextRequest } from "next/server";
import { authed, dbError, fail, ok } from "@/lib/api";
import { getLead } from "@/lib/queries";
import { whatsappOptSchema } from "@/lib/validate";
import { normalizePhone } from "@/lib/whatsapp";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/leads/:id/opt — manually record consent.
 * { decision: "opt_in" | "opt_out", note? }
 * Manual opt-in should reflect real-world consent (e.g. the lead
 * consented on a form or in person) — the note field is the audit trail.
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = whatsappOptSchema.safeParse(body);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  let lead;
  try {
    lead = await getLead(auth.supabase, id);
  } catch (e) {
    return fail("DB_ERROR", (e as Error).message, 500);
  }
  if (!lead) return fail("NOT_FOUND", "Lead not found.", 404);

  const digits = normalizePhone(lead.phone);
  if (!digits) {
    return fail("NO_PHONE", "This lead has no phone number.", 422);
  }

  const { data, error } = await auth.supabase
    .from("whatsapp_optins")
    .upsert(
      {
        phone: digits,
        workspace_id: lead.workspace_id,
        lead_id: lead.id,
        status: parsed.data.decision === "opt_in" ? "opted_in" : "opted_out",
        method: "manual",
        note: parsed.data.note ?? null,
        recorded_at: new Date().toISOString(),
      },
      { onConflict: "phone" }
    )
    .select()
    .single();
  if (error) return dbError(error);

  return ok(data);
}
