import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/queries";
import { LeadsTable } from "@/components/leads-table";

export const metadata: Metadata = { title: "Leads" };

export default async function LeadsPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/");

  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Leads</h1>
          <p className="text-sm text-gray-500">{workspace.name}</p>
        </div>
        <Link href="/leads/new" className="btn-primary">
          + Add lead
        </Link>
      </header>

      <LeadsTable workspaceId={workspace.id} />
    </div>
  );
}
