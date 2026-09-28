import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authed, dbError, fail, ok } from "@/lib/api";

type Ctx = { params: Promise<{ id: string; userId: string }> };

const roleSchema = z.object({ role: z.enum(["owner", "admin", "member", "viewer"]) });

/** PATCH — change a member's role (owner/admin). Last owner protected. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = await authed();
  if ("res" in auth) return auth.res;
  const { id, userId } = await ctx.params;

  const { data: me } = await auth.supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!me || (me.role !== "owner" && me.role !== "admin")) {
    return fail("FORBIDDEN", "Only owners and admins can change roles.", 403);
  }

  const body = await req.json().catch(() => null);
  const parsed = roleSchema.safeParse(body);
  if (!parsed.success) return fail("VALIDATION_ERROR", "Invalid role.");

  if (parsed.data.role !== "owner") {
    const { data: target } = await auth.supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (target?.role === "owner") {
      const { count } = await auth.supabase
        .from("workspace_members")
        .select("user_id", { count: "exact", head: true })
        .eq("workspace_id", id)
        .eq("role", "owner");
      if ((count ?? 0) <= 1) {
        return fail("LAST_OWNER", "A workspace must keep at least one owner.", 409);
      }
    }
  }

  const { data, error } = await auth.supabase
    .from("workspace_members")
    .update({ role: parsed.data.role })
    .eq("workspace_id", id)
    .eq("user_id", userId)
    .select()
    .single();
  if (error) return dbError(error);
  return ok(data);
}

/** DELETE — remove a member (owner/admin). Last owner protected. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const auth = await authed();
  if ("res" in auth) return auth.res;
  const { id, userId } = await ctx.params;

  const { data: me } = await auth.supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!me || (me.role !== "owner" && me.role !== "admin")) {
    return fail("FORBIDDEN", "Only owners and admins can remove members.", 403);
  }

  const { data: target } = await auth.supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (target?.role === "owner") {
    const { count } = await auth.supabase
      .from("workspace_members")
      .select("user_id", { count: "exact", head: true })
      .eq("workspace_id", id)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) {
      return fail("LAST_OWNER", "A workspace must keep at least one owner.", 409);
    }
  }

  const { error } = await auth.supabase
    .from("workspace_members")
    .delete()
    .eq("workspace_id", id)
    .eq("user_id", userId);
  if (error) return dbError(error);
  return new NextResponse(null, { status: 204 });
}
