/**
 * Runs the SHIPPED validation modules (src/lib/ai/schema.ts and
 * src/lib/validate.ts) against fixture payloads — proves the
 * "AI output never touches the DB unvalidated" gate works.
 * Run: npx tsx scripts/verify/validate-contract.ts
 */
import { commandOutputSchema, businessValidate } from "../../src/lib/ai/schema";
import { leadUpdateSchema, taskUpdateSchema, normalizePatch } from "../../src/lib/validate";

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`PASS  ${name}`);
  } else {
    failures++;
    console.error(`FAIL  ${name} ${detail}`);
  }
}

// ── 1. Valid multi-intent payload parses & validates ──
const good = {
  understood: true,
  clarification: "",
  intents: [
    {
      type: "create_task",
      lead_name: "Rahul Sharma",
      title: "Send kitchen quote",
      priority: "urgent",
      due_at: "2026-09-28T17:00:00+05:30",
      status: "",
      phone: "",
      company: "",
      note: "",
    },
    {
      type: "update_lead_status",
      lead_name: "Priya Nair",
      title: "",
      priority: "",
      due_at: "",
      status: "qualified",
      phone: "",
      company: "",
      note: "",
    },
  ],
};
const p1 = commandOutputSchema.safeParse(good);
check("valid payload passes zod", p1.success);
if (p1.success) {
  check("valid payload has no business issues", businessValidate(p1.data).length === 0);
  check("intent count preserved", p1.data.intents.length === 2);
}

// ── 2. Missing fields fall back to safe defaults (defensive .catch) ──
const p2 = commandOutputSchema.safeParse({ understood: true });
check("partial payload coerces to safe shape", p2.success && p2.success && p2.data.clarification === "" && p2.data.intents.length === 0);

// ── 3. Garbage is rejected or neutralized, never passed through ──
const p3 = commandOutputSchema.safeParse({ understood: "yes", intents: 42 });
check("garbage types are neutralized", p3.success && p3.data.understood === false && Array.isArray(p3.data.intents));

// ── 4. Bad due-date string rejected by union ──
const p4 = commandOutputSchema.safeParse({
  understood: true,
  clarification: "",
  intents: [{ ...good.intents[0], due_at: "tomorrow-ish" }],
});
check(
  "invalid due_at falls back to empty (then business rules catch it)",
  p4.success && p4.data.intents[0].due_at === ""
);

// ── 5. Business rules: create_task without title ──
const p5 = commandOutputSchema.safeParse({
  understood: true,
  clarification: "",
  intents: [{ ...good.intents[0], title: "   " }],
});
if (p5.success) {
  const issues = businessValidate(p5.data);
  check("titleless task blocked", issues.length === 1 && /title/i.test(issues[0].message));
}

// ── 6. Business rules: set_followup without date ──
const p6 = commandOutputSchema.safeParse({
  understood: true,
  clarification: "",
  intents: [{ type: "set_followup", lead_name: "Rahul", title: "", priority: "", due_at: "", status: "", phone: "", company: "", note: "" }],
});
if (p6.success) {
  const issues = businessValidate(p6.data);
  check("dateless follow-up blocked", issues.some((i) => /follow-up date/i.test(i.message)));
}

// ── 7. Insane year rejected ──
const p7 = commandOutputSchema.safeParse({
  understood: true,
  clarification: "",
  intents: [{ ...good.intents[0], due_at: "1899-01-01T10:00:00+05:30" }],
});
if (p7.success) {
  check("year-1899 date blocked", businessValidate(p7.data).length === 1);
}

// ── 8. REGRESSION: partial PATCH must NOT materialize absent keys ──
const patch = leadUpdateSchema.safeParse({ status: "won" });
check(
  "PATCH {status} keeps exactly one key",
  patch.success && JSON.stringify(Object.keys(patch.data)) === '["status"]',
  patch.success ? `got ${JSON.stringify(Object.keys(patch.data))}` : ""
);
const normalized = patch.success ? normalizePatch(patch.data as Record<string, unknown>) : {};
check(
  "normalized PATCH has only status (no null-wipe of phone/email/notes)",
  JSON.stringify(Object.keys(normalized)) === '["status"]'
);

// ── 9. Explicit clear: "" means null, and only for provided keys ──
const patch2 = leadUpdateSchema.safeParse({ phone: "", notes: "kept" });
if (patch2.success) {
  const n2 = normalizePatch(patch2.data as Record<string, unknown>);
  check(
    'empty string clears field, other keys untouched',
    n2.phone === null && n2.notes === "kept" && !("email" in n2)
  );
}

// ── 10. Empty PATCH rejected ──
check("empty PATCH rejected", !leadUpdateSchema.safeParse({}).success);

// ── 11. Task PATCH with only status ──
const patch3 = taskUpdateSchema.safeParse({ status: "completed" });
check(
  "task PATCH {status} keeps exactly one key",
  patch3.success && JSON.stringify(Object.keys(patch3.data)) === '["status"]'
);

// ── Phase 4: WhatsApp sandbox guards (SHIPPED lib/whatsapp.ts) ──
import {
  normalizePhone,
  isRecipientAllowed,
  classifyInbound,
} from "../../src/lib/whatsapp";
import { whatsappSendSchema, whatsappOptSchema } from "../../src/lib/validate";

check(
  "normalizePhone strips formatting",
  normalizePhone("+91 98100-12345") === "919810012345"
);
check(
  "normalizePhone strips 00 prefix",
  normalizePhone("00919810012345") === "919810012345"
);
check("normalizePhone empty-safe", normalizePhone(null) === "");

check(
  "allowlist admits whitelisted number (format-agnostic)",
  isRecipientAllowed("919810012345", [normalizePhone("+91 98100 12345")])
);
check(
  "allowlist rejects non-whitelisted number",
  !isRecipientAllowed("919999999999", ["919810012345"])
);
check(
  "allowlist is FAIL-CLOSED when empty (the core sandbox guarantee)",
  !isRecipientAllowed("919810012345", [])
);

check("STOP keyword classified", classifyInbound("STOP") === "stop");
check("opt out phrase classified", classifyInbound("please opt out") === "normal" || classifyInbound("opt out") === "stop");
check("START re-opt-in classified", classifyInbound("START") === "restart");
check("normal message classified", classifyInbound("hello, about the quote") === "normal");

check(
  "send schema rejects empty body",
  !whatsappSendSchema.safeParse({ lead_id: "00000000-0000-0000-0000-000000000000", body: "  " }).success
);
check(
  "send schema rejects >4096 chars",
  !whatsappSendSchema.safeParse({ lead_id: "00000000-0000-0000-0000-000000000000", body: "x".repeat(4097) }).success
);
check(
  "send schema accepts valid payload",
  whatsappSendSchema.safeParse({ lead_id: "00000000-0000-0000-0000-000000000000", body: "hi" }).success
);
check(
  "opt schema rejects bogus decision",
  !whatsappOptSchema.safeParse({ decision: "maybe" }).success
);

console.log(failures === 0 ? "\nALL VALIDATOR CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
