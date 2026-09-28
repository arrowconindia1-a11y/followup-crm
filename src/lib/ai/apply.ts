import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedCommand, ParsedIntent } from "@/lib/ai/schema";
import { LEAD_REQUIRED_INTENTS } from "@/lib/ai/schema";
import { resolveLeadByName, type LeadLite, type LeadResolution } from "@/lib/ai/resolve";

/**
 * Apply engine — the ONLY code path that turns a validated AI command
 * into database writes. It runs exclusively inside the authenticated
 * apply route, after re-validating the stored parsed JSON.
 *
 * All-or-nothing: every intent must pass resolution pre-checks before
 * any write happens.
 */

export interface ResolutionInput {
  index: number;
  lead_id: string;
}

export interface PreviewIntent {
  index: number;
  type: ParsedIntent["type"];
  description: string;
  lead: LeadResolution;
  blocked_reason?: string;
}

export interface ApplyOutcome {
  index: number;
  type: ParsedIntent["type"];
  ok: boolean;
  detail: string;
}

export function describeIntent(intent: ParsedIntent): string {
  const when = intent.due_at
    ? new Date(intent.due_at).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
        timeZone: "Asia/Calcutta",
      })
    : null;

  switch (intent.type) {
    case "create_task":
      return `Create task "${intent.title}"${when ? ` — due ${when}` : ""}${
        intent.priority ? ` (${intent.priority} priority)` : ""
      }${intent.lead_name ? ` for ${intent.lead_name}` : ""}`;
    case "create_lead":
      return `Create lead ${intent.lead_name}${intent.company ? ` (${intent.company})` : ""}${
        intent.phone ? ` · ${intent.phone}` : ""
      }`;
    case "update_lead_status":
      return `Set ${intent.lead_name}'s status to "${intent.status}"`;
    case "set_followup":
      return `Set ${intent.lead_name}'s next follow-up to ${when ?? intent.due_at}`;
    case "add_note":
      return `Add note to ${intent.lead_name}: "${intent.note}"`;
  }
}

export interface ResolutionCheck {
  preview: PreviewIntent[];
  /** intent index → chosen lead; only fully resolvable commands are applyable */
  blocked: { index: number; reason: string }[];
  resolvedLeads: Map<number, LeadLite | null>;
}

/** Runs at BOTH preview time and apply time — apply never trusts the
 *  preview's decisions, it redoes them. */
export async function checkResolutions(
  supabase: SupabaseClient,
  workspaceId: string,
  parsed: ParsedCommand,
  userResolutions: Map<number, string>
): Promise<ResolutionCheck> {
  const preview: PreviewIntent[] = [];
  const blocked: { index: number; reason: string }[] = [];
  const resolvedLeads = new Map<number, LeadLite | null>();

  for (let i = 0; i < parsed.intents.length; i++) {
    const intent = parsed.intents[i];
    const needsLead = LEAD_REQUIRED_INTENTS.includes(intent.type);
    let resolution: LeadResolution = { status: "none" };
    let blockReason: string | undefined;

    if (intent.lead_name.trim()) {
      resolution = await resolveLeadByName(supabase, workspaceId, intent.lead_name);
    }

    // User picked a specific lead for an ambiguous match
    const pickedId = userResolutions.get(i);
    if (pickedId) {
      const { data, error } = await supabase
        .from("leads")
        .select("id, name, company, phone")
        .eq("id", pickedId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (data) {
        resolution = { status: "matched", lead: data as LeadLite };
      }
    }

    if (resolution.status === "matched") {
      resolvedLeads.set(i, resolution.lead);
    } else if (needsLead || intent.type === "create_task") {
      if (resolution.status === "not_found") {
        if (needsLead) {
          blockReason = `No lead named "${intent.lead_name}" found in this workspace.`;
          resolvedLeads.set(i, null);
        } else {
          resolvedLeads.set(i, null); // task without a lead link is allowed
        }
      } else if (resolution.status === "ambiguous") {
        blockReason = `Several leads match "${intent.lead_name}" — pick one below.`;
      } else {
        resolvedLeads.set(i, null);
      }
    } else {
      resolvedLeads.set(i, null);
    }

    if (blockReason) blocked.push({ index: i, reason: blockReason });
    preview.push({
      index: i,
      type: intent.type,
      description: describeIntent(intent),
      lead: resolution,
      blocked_reason: blockReason,
    });
  }

  return { preview, blocked, resolvedLeads };
}

export async function executeIntents(
  supabase: SupabaseClient,
  ctx: { workspaceId: string; userId: string },
  parsed: ParsedCommand,
  resolvedLeads: Map<number, LeadLite | null>
): Promise<ApplyOutcome[]> {
  const outcomes: ApplyOutcome[] = [];

  for (let i = 0; i < parsed.intents.length; i++) {
    const intent = parsed.intents[i];
    const lead = resolvedLeads.get(i) ?? null;

    try {
      switch (intent.type) {
        case "create_task": {
          const { error } = await supabase.from("tasks").insert({
            workspace_id: ctx.workspaceId,
            lead_id: lead?.id ?? null,
            created_by: ctx.userId,
            title: intent.title.trim(),
            description: intent.note.trim() || null,
            due_at: intent.due_at || null,
            priority: intent.priority || "medium",
          });
          if (error) throw new Error(error.message);
          outcomes.push({ index: i, type: intent.type, ok: true, detail: `Task "${intent.title}" created${lead ? ` for ${lead.name}` : ""}.` });
          break;
        }
        case "create_lead": {
          const { error } = await supabase.from("leads").insert({
            workspace_id: ctx.workspaceId,
            name: intent.lead_name.trim(),
            phone: intent.phone.trim() || null,
            company: intent.company.trim() || null,
            source: "ai_command",
            status: "new",
          });
          if (error) throw new Error(error.message);
          outcomes.push({ index: i, type: intent.type, ok: true, detail: `Lead ${intent.lead_name} created.` });
          break;
        }
        case "update_lead_status": {
          if (!lead) throw new Error("Lead disappeared before apply.");
          const { error } = await supabase
            .from("leads")
            .update({ status: intent.status })
            .eq("id", lead.id);
          if (error) throw new Error(error.message);
          outcomes.push({ index: i, type: intent.type, ok: true, detail: `${lead.name} → ${intent.status}.` });
          break;
        }
        case "set_followup": {
          if (!lead) throw new Error("Lead disappeared before apply.");
          const { error } = await supabase
            .from("leads")
            .update({ next_follow_up_at: intent.due_at })
            .eq("id", lead.id);
          if (error) throw new Error(error.message);
          outcomes.push({ index: i, type: intent.type, ok: true, detail: `Follow-up for ${lead.name} set.` });
          break;
        }
        case "add_note": {
          if (!lead) throw new Error("Lead disappeared before apply.");
          const { data: current, error: fetchErr } = await supabase
            .from("leads")
            .select("notes")
            .eq("id", lead.id)
            .single();
          if (fetchErr) throw new Error(fetchErr.message);
          const stamp = new Date().toLocaleString("en-IN", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
            timeZone: "Asia/Calcutta",
          });
          const line = `[${stamp}] ${intent.note.trim()}`;
          const merged = current?.notes ? `${current.notes}\n${line}` : line;
          const { error } = await supabase
            .from("leads")
            .update({ notes: merged })
            .eq("id", lead.id);
          if (error) throw new Error(error.message);
          outcomes.push({ index: i, type: intent.type, ok: true, detail: `Note added to ${lead.name}.` });
          break;
        }
      }
    } catch (e) {
      outcomes.push({ index: i, type: intent.type, ok: false, detail: (e as Error).message });
    }
  }

  return outcomes;
}
