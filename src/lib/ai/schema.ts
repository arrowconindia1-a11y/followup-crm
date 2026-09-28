import { z } from "zod";
import { LEAD_STATUSES } from "@/types";

/**
 * ─────────────────────────────────────────────────────────────
 * AI COMMAND JSON CONTRACT — single source of truth.
 * (Corresponds to DESIGN.md §5 Phase 2. If the original
 * requirements pack's Section 8 differs, this file + prompts.ts
 * are the only things that need reconciling.)
 *
 * Conventions the model must follow:
 *  - "" (empty string) means "not provided" for every string field
 *  - dates are ISO 8601 with +05:30 offset (Asia/Calcutta)
 *  - max 5 intents per command
 * ─────────────────────────────────────────────────────────────
 */

export const INTENT_TYPES = [
  "create_task",
  "create_lead",
  "update_lead_status",
  "set_followup",
  "add_note",
] as const;
export type IntentType = (typeof INTENT_TYPES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

/** zod schema for the raw model output (defensive: defaults everywhere,
 *  because models occasionally drop "required" fields anyway). */
export const commandOutputSchema = z.object({
  understood: z.boolean().catch(false),
  clarification: z.string().max(500).catch(""),
  intents: z
    .array(
      z.object({
        type: z.enum(INTENT_TYPES),
        lead_name: z.string().max(200).catch(""),
        title: z.string().max(300).catch(""),
        priority: z
          .enum([...TASK_PRIORITIES, "none", ""])
          .catch("")
          .transform((v) => (v === "none" ? "" : v)),
        due_at: z
          .union([z.literal(""), z.string().datetime({ offset: true })])
          .catch(""),
        status: z
          .enum([...LEAD_STATUSES, "none", ""])
          .catch("")
          .transform((v) => (v === "none" ? "" : v)),
        phone: z.string().max(30).catch(""),
        company: z.string().max(200).catch(""),
        note: z.string().max(2000).catch(""),
      })
    )
    .max(5)
    .catch([]),
});

export type ParsedCommand = z.infer<typeof commandOutputSchema>;
export type ParsedIntent = ParsedCommand["intents"][number];

/** Gemini structured-output schema (OpenAPI subset). Every property is
 *  required so the model can't silently skip fields. */
export const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    understood: { type: "BOOLEAN" },
    clarification: {
      type: "STRING",
      description: "One short question if the request is unclear, else empty",
    },
    intents: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          type: { type: "STRING", enum: [...INTENT_TYPES] },
          lead_name: {
            type: "STRING",
            description: "Lead the intent refers to, exactly as written; empty if none",
          },
          title: { type: "STRING", description: "Task title (create_task)" },
          priority: { type: "STRING", enum: [...TASK_PRIORITIES, "none"] },
          due_at: {
            type: "STRING",
            description: "ISO 8601 with +05:30 offset, or empty",
          },
          status: {
            type: "STRING",
            enum: [...LEAD_STATUSES, "none"],
          },
          phone: { type: "STRING" },
          company: { type: "STRING" },
          note: { type: "STRING" },
        },
        required: [
          "type",
          "lead_name",
          "title",
          "priority",
          "due_at",
          "status",
          "phone",
          "company",
          "note",
        ],
      },
    },
  },
  required: ["understood", "clarification", "intents"],
} as const;

/** Intents that must resolve to an existing lead. */
export const LEAD_REQUIRED_INTENTS: IntentType[] = [
  "update_lead_status",
  "set_followup",
  "add_note",
];

export interface IntentIssue {
  index: number;
  message: string;
}

function isSaneIsoDate(value: string): boolean {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  const year = d.getUTCFullYear();
  return year >= 2000 && year <= 2100;
}

/**
 * Business validation on top of the structural zod parse.
 * Returns one issue per broken rule — these become user-visible errors
 * and block the apply step. AI output is UNTRUSTED input here.
 */
export function businessValidate(parsed: ParsedCommand): IntentIssue[] {
  const issues: IntentIssue[] = [];

  parsed.intents.forEach((intent, index) => {
    const at = (msg: string) => issues.push({ index, message: msg });

    if (intent.due_at && !isSaneIsoDate(intent.due_at)) {
      at(`Intent ${index + 1}: due date "${intent.due_at}" is not a valid, sane date.`);
    }

    switch (intent.type) {
      case "create_task":
        if (!intent.title.trim()) at(`Intent ${index + 1}: task needs a title.`);
        break;
      case "create_lead":
        if (!intent.lead_name.trim()) at(`Intent ${index + 1}: new lead needs a name.`);
        break;
      case "update_lead_status":
        if (!intent.lead_name.trim()) at(`Intent ${index + 1}: which lead should change status?`);
        if (!intent.status) at(`Intent ${index + 1}: missing target status.`);
        break;
      case "set_followup":
        if (!intent.lead_name.trim()) at(`Intent ${index + 1}: which lead is the follow-up for?`);
        if (!intent.due_at) at(`Intent ${index + 1}: missing follow-up date/time.`);
        break;
      case "add_note":
        if (!intent.lead_name.trim()) at(`Intent ${index + 1}: which lead gets the note?`);
        if (!intent.note.trim()) at(`Intent ${index + 1}: note is empty.`);
        break;
    }
  });

  return issues;
}
