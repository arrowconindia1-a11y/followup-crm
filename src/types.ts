export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "proposal_sent",
  "won",
  "lost",
  "dead",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const TASK_STATUSES = [
  "pending",
  "snoozed",
  "completed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface Lead {
  id: string;
  workspace_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  source: string | null;
  status: LeadStatus;
  notes: string | null;
  custom_fields: Record<string, unknown>;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  created_by: string | null;
  created_at: string;
}

export interface DashboardMetrics {
  workspace_id: string;
  total_leads: number;
  new_leads: number;
  contacted: number;
  qualified: number;
  proposals: number;
  won: number;
  lost: number;
  leads_7d: number;
  followups_today: number;
  followups_overdue: number;
  won_this_month: number;
}

export interface FollowUpRow {
  id: string;
  name: string;
  phone: string | null;
  status: LeadStatus;
  next_follow_up_at: string | null;
  is_overdue?: boolean;
}

export interface Task {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  created_by: string;
  title: string;
  description: string | null;
  due_at: string | null;
  status: TaskStatus;
  priority: "low" | "medium" | "high" | "urgent";
  snoozed_until: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  /** joined lead name from GET /api/tasks */
  leads?: { name: string } | null;
}

export interface AiCommandHistoryRow {
  id: string;
  raw_text: string;
  model: string;
  valid: boolean;
  applied: boolean;
  validation_errors: string[] | null;
  created_at: string;
  latency_ms: number | null;
  tokens_used: { prompt: number; candidates: number } | null;
}
