import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/queries";
import { LeadForm } from "@/components/lead-form";

export const metadata: Metadata = { title: "Add lead" };

export default async function NewLeadPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/");

  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Add lead</h1>
        <p className="text-sm text-gray-500">
          Fields marked * are required. Follow-up date is what keeps them off
          the &ldquo;forgot&rdquo; pile.
        </p>
      </header>
      <LeadForm mode="create" workspaceId={workspace.id} />
    </div>
  );
}
