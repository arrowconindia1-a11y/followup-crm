import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/queries";
import { WhatsAppPanel } from "@/components/whatsapp-panel";

export const metadata: Metadata = { title: "WhatsApp" };

export default async function WhatsAppPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/");

  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">WhatsApp</h1>
        <p className="text-sm text-gray-500">
          {workspace.name} · Meta Cloud API — sandbox test number
        </p>
      </header>

      <WhatsAppPanel workspaceId={workspace.id} />
    </div>
  );
}
