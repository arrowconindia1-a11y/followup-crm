import { NextRequest } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authed, dbError, fail, ok } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

const inviteSchema = z.object({
  email: z.string().trim().email().max(200).transform((e) => e.toLowerCase()),
  role: z.enum(["admin", "member", "viewer"]),
});

async function myRole(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.role as string | undefined) ?? null;
}

/** GET /api/workspaces/:id/members — list members (any member) */
export async function GET(_req: NextRequest, ctx: Ctx) {
  const auth = await authed();
  if ("res" in auth) return auth.res;
  const { id } = await ctx.params;

  const role = await myRole(auth.supabase, id, auth.user.id).catch(() => null);
  if (!role) return fail("FORBIDDEN", "Not a member of this workspace.", 403);

  const { data, error } = await auth.supabase
    .from("workspace_members")
    .select("user_id, role, joined_at, profiles(email, full_name)")
    .eq("workspace_id", id)
    .order("joined_at");
  if (error) return dbError(error);

  const { data: invites, error: invErr } = await auth.supabase
    .from("workspace_invites")
    .select("id, email, role, created_at, accepted_at")
    .eq("workspace_id", id)
    .is("accepted_at", null);
  if (invErr) return dbError(invErr);

  return ok({ members: data ?? [], pending_invites: invites ?? [], my_role: role });
}

/** POST /api/workspaces/:id/members — invite by email (owner/admin) */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = await authed();
  if ("res" in auth) return auth.res;
  const { id } = await ctx.params;

  const role = await myRole(auth.supabase, id, auth.user.id);
  if (!role) return fail("FORBIDDEN", "Not a member of this workspace.", 403);
  if (role !== "owner" && role !== "admin") {
    return fail("FORBIDDEN", "Only owners and admins can invite.", 403);
  }

  const body = await req.json().catch(() => null);
  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  // Already a member?
  const { data: existingProfile } = await auth.supabase
    .from("profiles")
    .select("id")
    .ilike("email", parsed.data.email)
    .maybeSingle();
  if (existingProfile) {
    const { data: existingMember } = await auth.supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", id)
      .eq("user_id", existingProfile.id)
      .maybeSingle();
    if (existingMember) {
      return fail("ALREADY_MEMBER", "That user is already a member.", 409);
    }
  }

  const { data: invite, error } = await auth.supabase
    .from("workspace_invites")
    .upsert(
      {
        workspace_id: id,
        email: parsed.data.email,
        role: parsed.data.role,
        invited_by: auth.user.id,
      },
      { onConflict: "workspace_id,email" }
    )
    .select()
    .single();
  if (error) return dbError(error);

  // Best-effort email invite via Supabase Auth (free built-in SMTP).
  // If it fails (rate limit etc.), the invite row still stands — the
  // user can sign up and accept from /settings.
  let emailSent = false;
  try {
    const admin = createAdminClient();
    if (admin) {
      const origin = req.nextUrl.origin;
      const { error: invErr } = await admin.auth.admin.inviteUserByEmail(
        parsed.data.email,
        { redirectTo: `${origin}/settings` }
      );
      emailSent = !invErr;
    }
  } catch {
    emailSent = false;
  }

  return ok({ invite, email_sent: emailSent }, 201);
}
