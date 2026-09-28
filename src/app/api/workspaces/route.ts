import { NextRequest } from "next/server";
import { authed, dbError, fail, ok } from "@/lib/api";
import { listWorkspaces } from "@/lib/queries";
import { workspaceCreateSchema } from "@/lib/validate";

/** GET /api/workspaces — workspaces the signed-in user belongs to */
export async function GET() {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  try {
    const workspaces = await listWorkspaces(auth.supabase);
    return ok(workspaces);
  } catch (e) {
    return fail("DB_ERROR", (e as Error).message, 500);
  }
}

/** POST /api/workspaces — create a workspace (atomic: row + owner membership) */
export async function POST(req: NextRequest) {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const body = await req.json().catch(() => null);
  const parsed = workspaceCreateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid input"
    );
  }

  const { data, error } = await auth.supabase.rpc("create_workspace", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
  });

  if (error) {
    if (error.code === "23505") {
      return fail(
        "SLUG_TAKEN",
        "That workspace URL is already taken — try a different one.",
        409
      );
    }
    return dbError(error);
  }

  return ok({ id: data as string }, 201);
}
