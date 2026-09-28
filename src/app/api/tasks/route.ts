import { NextRequest } from "next/server";
import { authed, dbError, fail, ok } from "@/lib/api";
import { taskCreateSchema, tasksQuerySchema } from "@/lib/validate";

/** GET /api/tasks?workspace_id=&status=&lead_id= */
export async function GET(req: NextRequest) {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  for (const key of Object.keys(raw)) if (raw[key] === "") delete raw[key];

  const parsed = tasksQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid query");
  }

  let query = auth.supabase
    .from("tasks")
    .select("*, leads(name)")
    .eq("workspace_id", parsed.data.workspace_id)
    .order("due_at", { ascending: true, nullsFirst: false });

  if (parsed.data.status) query = query.eq("status", parsed.data.status);
  if (parsed.data.lead_id) query = query.eq("lead_id", parsed.data.lead_id);

  const { data, error } = await query;
  if (error) return dbError(error);
  return ok(data ?? []);
}

/** POST /api/tasks */
export async function POST(req: NextRequest) {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const body = await req.json().catch(() => null);
  const parsed = taskCreateSchema.safeParse(body);
  if (!parsed.success) {
    return fail("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const { data, error } = await auth.supabase
    .from("tasks")
    .insert({
      workspace_id: parsed.data.workspace_id,
      created_by: auth.user.id,
      lead_id: parsed.data.lead_id ?? null,
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      due_at: parsed.data.due_at ?? null,
      priority: parsed.data.priority ?? "medium",
    })
    .select()
    .single();
  if (error) return dbError(error);
  return ok(data, 201);
}
