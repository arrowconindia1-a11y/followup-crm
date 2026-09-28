import { authed, fail, ok } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/invites/accept — the signed-in user accepts any pending
 * invite addressed to their email. Uses the service-role client for
 * the membership insert (the accepter is not yet a member, so RLS
 * would block a direct insert).
 */
export async function POST() {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const email = (auth.user.email ?? "").toLowerCase();
  if (!email) return fail("NO_EMAIL", "Account has no email.", 422);

  const admin = createAdminClient();
  if (!admin) {
    return fail(
      "SERVICE_KEY_MISSING",
      "SUPABASE_SERVICE_ROLE_KEY is not set — invite acceptance unavailable.",
      500
    );
  }

  const { data: invites, error } = await admin
    .from("workspace_invites")
    .select("id, workspace_id, role")
    .ilike("email", email)
    .is("accepted_at", null);
  if (error) return fail("DB_ERROR", error.message, 500);

  const accepted: { workspace_id: string; role: string }[] = [];
  for (const invite of invites ?? []) {
    const { error: insErr } = await admin
      .from("workspace_members")
      .upsert(
        { workspace_id: invite.workspace_id, user_id: auth.user.id, role: invite.role },
        { onConflict: "workspace_id,user_id", ignoreDuplicates: true }
      );
    if (insErr) return fail("DB_ERROR", insErr.message, 500);

    const { error: upErr } = await admin
      .from("workspace_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);
    if (upErr) return fail("DB_ERROR", upErr.message, 500);

    accepted.push({ workspace_id: invite.workspace_id, role: invite.role });
  }

  return ok({ accepted });
}
