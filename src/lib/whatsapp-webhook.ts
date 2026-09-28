import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyInbound, normalizePhone } from "@/lib/whatsapp";

/**
 * Webhook payload processing (runs via Next `after()` so Meta gets a
 * fast 200). Uses the service-role client — no user session exists.
 * Idempotent: the (wa_message_id, event_type) unique index dedupes.
 */

interface WaValue {
  metadata?: { phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id?: string }[];
  messages?: {
    from?: string;
    id?: string;
    timestamp?: string;
    type?: string;
    text?: { body?: string };
  }[];
  statuses?: {
    id?: string;
    status?: string;
    timestamp?: string;
    recipient_id?: string;
    errors?: { title?: string; message?: string }[];
  }[];
}

interface MatchedLead {
  id: string;
  workspace_id: string;
  name: string;
  phone: string | null;
}

/** Find a lead by normalized phone (format-agnostic match). */
async function findLeadByPhone(
  admin: SupabaseClient,
  digits: string
): Promise<MatchedLead | null> {
  const { data, error } = await admin
    .from("leads")
    .select("id, workspace_id, name, phone")
    .not("phone", "is", null);
  if (error) throw new Error(error.message);
  const match = (data ?? []).find(
    (l) => normalizePhone(l.phone as string) === digits
  );
  return (match as MatchedLead) ?? null;
}

/** Store the raw event; returns false when it was a duplicate. */
async function logEvent(
  admin: SupabaseClient,
  evt: {
    workspace_id: string | null;
    wa_message_id: string | null;
    phone: string | null;
    event_type: string;
    payload: unknown;
  }
): Promise<boolean> {
  const { data, error } = await admin
    .from("whatsapp_events")
    .upsert(
      { ...evt, received_at: new Date().toISOString() },
      { onConflict: "wa_message_id,event_type", ignoreDuplicates: true }
    )
    .select("id");
  if (error) {
    // non-dedupe-key conflict (e.g. missing dedupe id) → plain insert
    if (evt.wa_message_id) throw new Error(error.message);
    const retry = await admin.from("whatsapp_events").insert({
      ...evt,
      received_at: new Date().toISOString(),
    });
    if (retry.error) throw new Error(retry.error.message);
    return true;
  }
  return (data ?? []).length > 0;
}

async function upsertOptin(
  admin: SupabaseClient,
  row: {
    phone: string;
    workspace_id: string | null;
    lead_id: string | null;
    status: "opted_in" | "opted_out" | "unknown";
    method: string;
    note: string | null;
  }
): Promise<void> {
  const { error } = await admin
    .from("whatsapp_optins")
    .upsert(
      { ...row, recorded_at: new Date().toISOString() },
      { onConflict: "phone" }
    );
  if (error) throw new Error(error.message);
}

export async function processWebhookPayload(payload: unknown): Promise<void> {
  const admin = (await import("@/lib/supabase/admin")).createAdminClient();
  if (!admin) {
    console.error(
      "[whatsapp] SUPABASE_SERVICE_ROLE_KEY missing — webhook payload dropped."
    );
    return;
  }

  const entries = (payload as { entry?: { changes?: { value?: WaValue }[] }[] })
    ?.entry;
  if (!Array.isArray(entries)) return;

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;

      // ── Inbound messages ──
      for (const msg of value.messages ?? []) {
        const digits = normalizePhone(msg.from);
        if (!digits || !msg.id) continue;

        const lead = await findLeadByPhone(admin, digits);
        const fresh = await logEvent(admin, {
          workspace_id: lead?.workspace_id ?? null,
          wa_message_id: msg.id,
          phone: digits,
          event_type: "received",
          payload: { type: msg.type, from: digits, timestamp: msg.timestamp },
        });
        if (!fresh) continue; // duplicate delivery — skip side effects

        const body =
          msg.type === "text"
            ? msg.text?.body ?? ""
            : `[${msg.type ?? "unsupported"} message]`;

        // Consent handling
        const kind = classifyInbound(body);
        const { data: existing } = await admin
          .from("whatsapp_optins")
          .select("status")
          .eq("phone", digits)
          .maybeSingle();

        if (kind === "stop") {
          await upsertOptin(admin, {
            phone: digits,
            workspace_id: lead?.workspace_id ?? null,
            lead_id: lead?.id ?? null,
            status: "opted_out",
            method: "keyword",
            note: `Opted out via keyword: "${body.slice(0, 60)}"`,
          });
        } else if (kind === "restart" && existing?.status === "opted_out") {
          await upsertOptin(admin, {
            phone: digits,
            workspace_id: lead?.workspace_id ?? null,
            lead_id: lead?.id ?? null,
            status: "opted_in",
            method: "keyword",
            note: `Re-opted in via keyword: "${body.slice(0, 60)}"`,
          });
        } else if (!existing) {
          // First inbound from this number: user-initiated contact.
          await upsertOptin(admin, {
            phone: digits,
            workspace_id: lead?.workspace_id ?? null,
            lead_id: lead?.id ?? null,
            status: "opted_in",
            method: "inbound_message",
            note: "Consent inferred: user messaged us first.",
          });
        }
        // NOTE: a normal message from an opted-OUT number does NOT
        // re-enable sending — only an explicit restart keyword does.

        const { error: insErr } = await admin.from("whatsapp_messages").insert({
          workspace_id: lead?.workspace_id ?? null,
          lead_id: lead?.id ?? null,
          direction: "inbound",
          body,
          status: "received",
          wa_message_id: msg.id,
          sent_at: msg.timestamp
            ? new Date(Number(msg.timestamp) * 1000).toISOString()
            : new Date().toISOString(),
        });
        if (insErr && insErr.code !== "23505") throw new Error(insErr.message);
      }

      // ── Delivery status updates for outbound messages ──
      for (const st of value.statuses ?? []) {
        if (!st.id || !st.status) continue;
        const eventType = `status:${st.status}`;
        const digits = normalizePhone(st.recipient_id);

        const { data: existingMsg } = await admin
          .from("whatsapp_messages")
          .select("id, workspace_id")
          .eq("wa_message_id", st.id)
          .maybeSingle();

        const fresh = await logEvent(admin, {
          workspace_id: existingMsg?.workspace_id ?? null,
          wa_message_id: st.id,
          phone: digits || null,
          event_type: eventType,
          payload: { status: st.status, timestamp: st.timestamp, errors: st.errors ?? [] },
        });
        if (!fresh || !existingMsg) continue;

        const ts = st.timestamp
          ? new Date(Number(st.timestamp) * 1000).toISOString()
          : new Date().toISOString();

        const update: Record<string, unknown> = { status: st.status };
        if (st.status === "sent") update.sent_at = ts;
        if (st.status === "delivered") update.delivered_at = ts;
        if (st.status === "read") update.read_at = ts;
        if (st.status === "failed") {
          update.error =
            st.errors?.[0]?.message ?? st.errors?.[0]?.title ?? "Send failed";
        }

        const { error: upErr } = await admin
          .from("whatsapp_messages")
          .update(update)
          .eq("id", existingMsg.id);
        if (upErr) throw new Error(upErr.message);
      }
    }
  }
}
