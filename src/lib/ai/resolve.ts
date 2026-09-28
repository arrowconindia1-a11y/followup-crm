import type { SupabaseClient } from "@supabase/supabase-js";

/** Lead resolution for AI intents — always workspace-scoped (RLS also applies). */

export interface LeadLite {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
}

export type LeadResolution =
  | { status: "none" } // intent doesn't reference a lead
  | { status: "matched"; lead: LeadLite }
  | { status: "ambiguous"; candidates: LeadLite[] }
  | { status: "not_found" };

const MAX_CANDIDATES = 5;

async function search(
  supabase: SupabaseClient,
  workspaceId: string,
  pattern: string
): Promise<LeadLite[]> {
  const { data, error } = await supabase
    .from("leads")
    .select("id, name, company, phone, updated_at")
    .eq("workspace_id", workspaceId)
    .ilike("name", pattern)
    .order("updated_at", { ascending: false })
    .limit(MAX_CANDIDATES);
  if (error) throw new Error(error.message);
  return (data ?? []) as LeadLite[];
}

export async function resolveLeadByName(
  supabase: SupabaseClient,
  workspaceId: string,
  leadName: string
): Promise<LeadResolution> {
  const name = leadName.trim();
  if (!name) return { status: "none" };

  // 1) exact (case-insensitive) match
  let hits = await search(supabase, workspaceId, name);
  if (hits.length === 1) return { status: "matched", lead: hits[0] };
  if (hits.length > 1) return { status: "ambiguous", candidates: hits };

  // 2) prefix match ("Rahul" → "Rahul Sharma")
  hits = await search(supabase, workspaceId, `${name}%`);
  if (hits.length === 1) return { status: "matched", lead: hits[0] };
  if (hits.length > 1) return { status: "ambiguous", candidates: hits };

  return { status: "not_found" };
}
