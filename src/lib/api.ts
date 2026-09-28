import { NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** Success envelope: { data } (+ optional meta for lists) */
export function ok(data: unknown, status = 200, meta?: Record<string, unknown>) {
  return NextResponse.json(meta ? { data, meta } : { data }, { status });
}

/** Error envelope: { error: { code, message } } */
export function fail(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export type Authed =
  | { supabase: SupabaseClient; user: User }
  | { res: NextResponse };

/** Resolves the signed-in user + a request-scoped Supabase client. */
export async function authed(): Promise<Authed> {
  const supabase = await createClient();
  if (!supabase) {
    return {
      res: fail(
        "ENV_MISSING",
        "Supabase env vars are not set. Copy .env.example to .env.local and fill in both values (see SETUP.md).",
        500
      ),
    };
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { res: fail("UNAUTHENTICATED", "You must be signed in.", 401) };
  }
  return { supabase, user: data.user };
}

/** Map common Postgres/PostgREST error codes to HTTP responses. */
export function dbError(error: { code?: string; message: string }): NextResponse {
  if (error.code === "23505") {
    return fail(
      "DUPLICATE",
      error.message.includes("leads_ws_phone_uniq")
        ? "A lead with this phone number already exists in this workspace."
        : "That record already exists.",
      409
    );
  }
  if (error.code === "PGRST116") {
    return fail("NOT_FOUND", "Record not found.", 404);
  }
  if (error.code === "42501") {
    return fail("FORBIDDEN", "Row Level Security rejected this operation.", 403);
  }
  return fail("DB_ERROR", error.message, 500);
}
