import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  DashboardMetrics,
  FollowUpRow,
  Lead,
  LeadStatus,
  Workspace,
} from "@/types";
import type { LeadCreateInput, LeadUpdateInput } from "@/lib/validate";
import { normalizePatch } from "@/lib/validate";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/utils";

export async function listWorkspaces(supabase: SupabaseClient): Promise<Workspace[]> {
  const { data, error } = await supabase
    .from("workspaces")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Workspace[];
}

/** Active workspace = cookie pick if it's one of ours, else the first. */
export async function getActiveWorkspace(
  supabase: SupabaseClient
): Promise<Workspace | null> {
  const workspaces = await listWorkspaces(supabase);
  if (workspaces.length === 0) return null;
  const cookieStore = await cookies();
  const picked = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  return workspaces.find((w) => w.id === picked) ?? workspaces[0];
}

/** Strip characters that would break PostgREST's .or() filter syntax. */
export function sanitizeSearch(s: string): string {
  return s.replace(/[%(),]/g, " ").trim();
}

export async function listLeads(
  supabase: SupabaseClient,
  opts: {
    workspaceId: string;
    status?: LeadStatus;
    search?: string;
    page: number;
    limit: number;
  }
): Promise<{ items: Lead[]; total: number }> {
  let query = supabase
    .from("leads")
    .select("*", { count: "exact" })
    .eq("workspace_id", opts.workspaceId)
    .order("created_at", { ascending: false });

  if (opts.status) query = query.eq("status", opts.status);

  if (opts.search) {
    const s = sanitizeSearch(opts.search);
    if (s) {
      query = query.or(
        `name.ilike.%${s}%,phone.ilike.%${s}%,company.ilike.%${s}%,email.ilike.%${s}%`
      );
    }
  }

  const from = (opts.page - 1) * opts.limit;
  query = query.range(from, from + opts.limit - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  return { items: (data ?? []) as Lead[], total: count ?? 0 };
}

export async function getLead(
  supabase: SupabaseClient,
  id: string
): Promise<Lead | null> {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Lead | null) ?? null;
}

export async function createLead(
  supabase: SupabaseClient,
  input: LeadCreateInput
): Promise<Lead> {
  const { data, error } = await supabase
    .from("leads")
    .insert({
      workspace_id: input.workspace_id,
      name: input.name,
      phone: input.phone ?? null,
      email: input.email ?? null,
      company: input.company ?? null,
      source: input.source ?? null,
      status: input.status ?? "new",
      notes: input.notes ?? null,
      next_follow_up_at: input.next_follow_up_at ?? null,
    })
    .select()
    .single();
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data as Lead;
}

export async function updateLead(
  supabase: SupabaseClient,
  id: string,
  patch: LeadUpdateInput
): Promise<Lead> {
  const row = normalizePatch(patch as Record<string, unknown>);
  const { data, error } = await supabase
    .from("leads")
    .update(row)
    .eq("id", id)
    .select()
    .single();
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
  return data as Lead;
}

export async function deleteLead(
  supabase: SupabaseClient,
  id: string
): Promise<void> {
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) throw Object.assign(new Error(error.message), { code: error.code });
}

export const EMPTY_METRICS: Omit<DashboardMetrics, "workspace_id"> = {
  total_leads: 0,
  new_leads: 0,
  contacted: 0,
  qualified: 0,
  proposals: 0,
  won: 0,
  lost: 0,
  leads_7d: 0,
  followups_today: 0,
  followups_overdue: 0,
  won_this_month: 0,
};

export async function getDashboard(supabase: SupabaseClient, workspaceId: string) {
  const [metricsRes, followupsRes, recentRes, openTasksRes, overdueTasksRes] = await Promise.all([
    supabase
      .from("v_dashboard_metrics")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    supabase
      .from("v_followups_due")
      .select("*")
      .eq("workspace_id", workspaceId)
      .limit(8),
    supabase
      .from("leads")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "pending"),
    supabase
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("status", "pending")
      .lt("due_at", new Date().toISOString()),
  ]);

  if (metricsRes.error) throw new Error(metricsRes.error.message);
  if (followupsRes.error) throw new Error(followupsRes.error.message);
  if (recentRes.error) throw new Error(recentRes.error.message);
  if (openTasksRes.error) throw new Error(openTasksRes.error.message);
  if (overdueTasksRes.error) throw new Error(overdueTasksRes.error.message);

  const metrics: DashboardMetrics = {
    workspace_id: workspaceId,
    ...EMPTY_METRICS,
    ...((metricsRes.data ?? {}) as Partial<DashboardMetrics>),
  };

  return {
    metrics,
    followups: (followupsRes.data ?? []) as FollowUpRow[],
    recent: (recentRes.data ?? []) as Lead[],
    tasks: {
      open: openTasksRes.count ?? 0,
      overdue: overdueTasksRes.count ?? 0,
    },
  };
}
