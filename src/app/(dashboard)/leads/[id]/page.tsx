import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getLead } from "@/lib/queries";
import { LeadForm } from "@/components/lead-form";
import { formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Lead" };

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const supabase = await createClient();
  if (!supabase) redirect("/");

  const { id } = await params;
  const lead = await getLead(supabase, id).catch(() => null);
  if (!lead) notFound();

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">{lead.name}</h1>
        <p className="text-sm text-gray-500">
          Added {formatDateTime(lead.created_at)} · updated{" "}
          {formatDateTime(lead.updated_at)}
        </p>
      </header>
      <LeadForm mode="edit" lead={lead} />
    </div>
  );
}
