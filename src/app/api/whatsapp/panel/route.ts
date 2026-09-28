import { NextRequest } from "next/server";
import { z } from "zod";
import { authed, dbError, fail, ok } from "@/lib/api";
import { getWhatsAppConfig, normalizePhone } from "@/lib/whatsapp";

const querySchema = z.object({ workspace_id: z.string().uuid() });

/**
 * GET /api/whatsapp/panel?workspace_id= — everything the WhatsApp UI
 * needs in one round-trip. NEVER returns secrets: the config block is
 * booleans + counts only.
 */
export async function GET(req: NextRequest) {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const parsed = querySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", "workspace_id (uuid) is required.");
  }
  const workspaceId = parsed.data.workspace_id;

  const cfg = getWhatsAppConfig();

  const [leadsRes, optinsRes, messagesRes, eventsRes] = await Promise.all([
    auth.supabase
      .from("leads")
      .select("id, name, company, phone, status")
      .eq("workspace_id", workspaceId)
      .not("phone", "is", null)
      .order("name")
      .limit(50),
    auth.supabase
      .from("whatsapp_optins")
      .select("lead_id, phone, status, method, note, recorded_at")
      .eq("workspace_id", workspaceId),
    auth.supabase
      .from("whatsapp_messages")
      .select("id, lead_id, direction, body, status, error, wa_message_id, created_at, sent_at, delivered_at, read_at")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(25),
    auth.supabase
      .from("whatsapp_events")
      .select("id, event_type, phone, wa_message_id, received_at")
      .eq("workspace_id", workspaceId)
      .order("received_at", { ascending: false })
      .limit(10),
  ]);

  if (leadsRes.error) return dbError(leadsRes.error);
  if (optinsRes.error) return dbError(optinsRes.error);
  if (messagesRes.error) return dbError(messagesRes.error);
  if (eventsRes.error) return dbError(eventsRes.error);

  // map optins by normalized phone so the UI can match any lead format
  const optinsByPhone: Record<string, unknown> = {};
  for (const o of optinsRes.data ?? []) {
    optinsByPhone[normalizePhone(o.phone as string)] = o;
  }

  return ok({
    config: {
      credentials_set: cfg !== null,
      verify_token_set: Boolean(cfg?.verifyToken),
      allowed_recipients: cfg?.allowedRecipients.length ?? 0,
      service_role_set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    },
    leads: leadsRes.data ?? [],
    optins_by_phone: optinsByPhone,
    messages: messagesRes.data ?? [],
    events: eventsRes.data ?? [],
  });
}
