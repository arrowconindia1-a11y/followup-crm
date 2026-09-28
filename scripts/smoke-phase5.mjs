#!/usr/bin/env node
/**
 * Phase 5 smoke test — run this yourself against YOUR Supabase project.
 *
 *   node scripts/smoke-phase5.mjs --email you@x.com --password secret123
 *
 * Optional:
 *   --email2 / --password2   second account for the viewer-role test
 *   --base http://localhost:3000   also health-check the running app
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from
 * the environment or from .env.local. Requires migrations 0001–0008
 * to have been run, and "Confirm email" turned OFF for sign-ups
 * (Supabase → Authentication → Providers → Email).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

// ── args + env ──────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).reduce((a, v, i, arr) => {
    if (v.startsWith("--")) a.push([v.slice(2), arr[i + 1]]);
    return a;
  }, [])
);

let env = {};
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !line.trim().startsWith("#")) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let failures = 0;
const pass = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
};

if (!URL || !KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (env or .env.local)");
  process.exit(1);
}
if (!args.email || !args.password) {
  console.error("Usage: node scripts/smoke-phase5.mjs --email you@x.com --password secret123 [--email2 ... --password2 ...] [--base http://localhost:3000]");
  process.exit(1);
}

// Node 20 has no native WebSocket; supabase-js only needs it for realtime,
// which this script never uses. Stub it so createClient initializes cleanly.
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class WebSocketStub {
    constructor() {
      throw new Error("Realtime is not used by the smoke script.");
    }
  };
}

const supabase = createClient(URL, KEY);

async function signIn(email, password) {
  let { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error?.message?.includes("Invalid login")) {
    const up = await supabase.auth.signUp({ email, password });
    if (up.error) throw new Error(`sign-up failed for ${email}: ${up.error.message}`);
    if (!up.data.session) throw new Error(`sign-up for ${email} needs email confirmation — turn it OFF in Supabase Auth settings, or confirm the email first.`);
    ({ data, error } = await supabase.auth.signInWithPassword({ email, password }));
    if (error) throw new Error(error.message);
  } else if (error) {
    throw new Error(error.message);
  }
  return data.user;
}

// ── run ─────────────────────────────────────────────────────────────
try {
  if (args.base) {
    const res = await fetch(`${args.base}/login`);
    pass("app /login responds 200", res.status === 200, `got ${res.status}`);
  }

  const user1 = await signIn(args.email, args.password);
  pass("user 1 authenticated", Boolean(user1?.id));

  const slug = `smoke-${Date.now()}`;
  const { data: wsId, error: wsErr } = await supabase.rpc("create_workspace", {
    p_name: "Smoke Test WS",
    p_slug: slug,
  });
  pass("create_workspace RPC", Boolean(wsId) && !wsErr, wsErr?.message ?? "");
  if (!wsId) throw new Error("cannot continue without a workspace");

  const { error: leadErr } = await supabase
    .from("leads")
    .insert({ workspace_id: wsId, name: "Smoke Lead", phone: "+919800000000" });
  pass("insert lead", !leadErr, leadErr?.message ?? "");

  const { data: b1 } = await supabase.rpc("bump_usage", { p_workspace_id: wsId, p_counter: "ai_requests" });
  const { data: b2 } = await supabase.rpc("bump_usage", { p_workspace_id: wsId, p_counter: "ai_requests" });
  pass("bump_usage counts 1 then 2", b1 === 1 && b2 === 2, `got ${b1}, ${b2}`);

  const { data: counters } = await supabase
    .from("usage_counters")
    .select("ai_requests")
    .eq("workspace_id", wsId)
    .maybeSingle();
  pass("usage_counters readable by member", counters?.ai_requests === 2, `got ${counters?.ai_requests}`);

  const { error: bogusErr } = await supabase.rpc("bump_usage", { p_workspace_id: wsId, p_counter: "bogus" });
  pass("unknown counter rejected", Boolean(bogusErr));

  if (args.email2 && args.password2) {
    const user2 = await signIn(args.email2, args.password2);
    pass("user 2 authenticated", Boolean(user2?.id));

    const { error: addErr } = await supabase
      .from("workspace_members")
      .insert({ workspace_id: wsId, user_id: user2.id, role: "viewer" });
    pass("owner adds viewer", !addErr, addErr?.message ?? "");

    // viewer signs in with a fresh client to get their own RLS context
    const sb2 = createClient(URL, KEY);
    await sb2.auth.signInWithPassword({ email: args.email2, password: args.password2 });

    const { data: visible } = await sb2.from("leads").select("id").eq("workspace_id", wsId);
    pass("viewer CAN read leads", (visible?.length ?? 0) === 1, `sees ${visible?.length}`);

    const { error: vWrite } = await sb2
      .from("leads")
      .insert({ workspace_id: wsId, name: "Viewer write" });
    pass(
      "viewer CANNOT write (RLS 42501)",
      Boolean(vWrite) && (vWrite.code === "42501" || /row-level security/i.test(vWrite.message)),
      vWrite?.code ?? vWrite?.message ?? "write unexpectedly succeeded"
    );

    const { error: rmErr } = await supabase
      .from("workspace_members")
      .delete()
      .eq("workspace_id", wsId)
      .eq("user_id", user2.id);
    pass("owner removes viewer", !rmErr, rmErr?.message ?? "");

    const { data: after } = await sb2.from("leads").select("id").eq("workspace_id", wsId);
    pass("removed viewer sees 0 leads", (after?.length ?? 0) === 0, `sees ${after?.length}`);
  } else {
    console.log("SKIP  viewer-role tests (pass --email2/--password2 to enable)");
  }
} catch (e) {
  failures++;
  console.error("FAIL  unexpected error:", e.message);
}

console.log(failures === 0 ? "\nSMOKE TEST PASSED ✅" : `\n${failures} CHECK(S) FAILED ❌`);
process.exit(failures === 0 ? 0 : 1);
