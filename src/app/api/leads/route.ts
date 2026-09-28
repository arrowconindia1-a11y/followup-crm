import { NextRequest } from "next/server";
import { authed, dbError, fail, ok } from "@/lib/api";
import { listLeads, createLead } from "@/lib/queries";
import { leadCreateSchema, leadsQuerySchema } from "@/lib/validate";

/** GET /api/leads?workspace_id=&status=&search=&page=&limit= */
export async function GET(req: NextRequest) {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const raw = Object.fromEntries(req.nextUrl.searchParams.entries());
  for (const key of Object.keys(raw)) {
    if (raw[key] === "") delete raw[key];
  }

  const parsed = leadsQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return fail(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid query"
    );
  }

  try {
    const { items, total } = await listLeads(auth.supabase, {
      workspaceId: parsed.data.workspace_id,
      status: parsed.data.status,
      search: parsed.data.search,
      page: parsed.data.page,
      limit: parsed.data.limit,
    });
    return ok(items, 200, {
      total,
      page: parsed.data.page,
      limit: parsed.data.limit,
    });
  } catch (e) {
    return fail("DB_ERROR", (e as Error).message, 500);
  }
}

/** POST /api/leads — create a lead */
export async function POST(req: NextRequest) {
  const auth = await authed();
  if ("res" in auth) return auth.res;

  const body = await req.json().catch(() => null);
  const parsed = leadCreateSchema.safeParse(body);
  if (!parsed.success) {
    return fail(
      "VALIDATION_ERROR",
      parsed.error.issues[0]?.message ?? "Invalid input"
    );
  }

  try {
    const lead = await createLead(auth.supabase, parsed.data);
    return ok(lead, 201);
  } catch (e) {
    return dbError(e as { code?: string; message: string });
  }
}
