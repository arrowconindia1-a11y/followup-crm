import { z } from "zod";
import { LEAD_STATUSES, TASK_STATUSES } from "@/types";
import { TASK_PRIORITIES } from "@/lib/ai/schema";

/**
 * Validation rules. IMPORTANT for PATCH schemas: no .transform() on
 * optional keys — zod would materialize absent keys as transformed
 * values and silently null out untouched columns on partial updates.
 * Absent keys stay absent; "" explicitly means "clear this field"
 * and is normalized to null at the write layer.
 */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be ${max} characters or fewer`)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined));

const textOrEmpty = (max: number) =>
  z.union([z.literal(""), z.string().trim().max(max)]).optional();

const emailOrEmpty = z.union([
  z.literal(""),
  z.string().trim().email("Enter a valid email").max(200),
]);

const dateTimeOrEmpty = z.union([
  z.literal(""),
  z.string().datetime({ offset: true }),
]);

// ── Leads ──────────────────────────────────────────────────────────

export const leadCreateSchema = z.object({
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1, "Name is required").max(200),
  phone: optionalText(30),
  email: z
    .union([z.literal(""), z.string().trim().email("Enter a valid email").max(200)])
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  company: optionalText(200),
  source: optionalText(80),
  status: z.enum(LEAD_STATUSES).optional(),
  notes: z.string().trim().max(5000).optional(),
  next_follow_up_at: z
    .union([z.literal(""), z.string().datetime({ offset: true })])
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

export const leadUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    phone: textOrEmpty(30),
    email: emailOrEmpty.optional(),
    company: textOrEmpty(200),
    source: textOrEmpty(80),
    status: z.enum(LEAD_STATUSES).optional(),
    notes: textOrEmpty(5000),
    next_follow_up_at: dateTimeOrEmpty.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const leadsQuerySchema = z.object({
  workspace_id: z.string().uuid(),
  status: z.enum(LEAD_STATUSES).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── Tasks ──────────────────────────────────────────────────────────

export const taskCreateSchema = z.object({
  workspace_id: z.string().uuid(),
  title: z.string().trim().min(1, "Title is required").max(300),
  description: optionalText(2000),
  lead_id: z.string().uuid().optional(),
  due_at: z
    .union([z.literal(""), z.string().datetime({ offset: true })])
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  priority: z.enum(TASK_PRIORITIES).optional(),
});

export const taskUpdateSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    status: z.enum(TASK_STATUSES).optional(),
    priority: z.enum(TASK_PRIORITIES).optional(),
    due_at: dateTimeOrEmpty.optional(),
    snoozed_until: dateTimeOrEmpty.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const tasksQuerySchema = z.object({
  workspace_id: z.string().uuid(),
  status: z.enum(TASK_STATUSES).optional(),
  lead_id: z.string().uuid().optional(),
});

// ── WhatsApp (Phase 4) ─────────────────────────────────────────────

export const whatsappSendSchema = z.object({
  lead_id: z.string().uuid(),
  body: z.string().trim().min(1, "Message is empty").max(4096),
});

export const whatsappOptSchema = z.object({
  decision: z.enum(["opt_in", "opt_out"]),
  note: z.string().trim().max(500).optional(),
});

// ── Workspaces ─────────────────────────────────────────────────────

export const workspaceCreateSchema = z.object({
  name: z.string().trim().min(1, "Workspace name is required").max(80),
  slug: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9][a-z0-9-]{1,39}$/,
      "Use lowercase letters, numbers and dashes (2–40 chars)"
    ),
});

export type LeadCreateInput = z.infer<typeof leadCreateSchema>;
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateSchema>;

/** Normalize a validated PATCH payload: drop undefined, "" → null. */
export function normalizePatch(
  patch: Record<string, unknown>
): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    row[key] = value === "" ? null : value;
  }
  return row;
}
