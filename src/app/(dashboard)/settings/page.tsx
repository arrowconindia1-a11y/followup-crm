import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/queries";
import { SettingsPanel } from "@/components/settings-panel";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/");

  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-gray-500">{workspace.name}</p>
      </header>

      <SettingsPanel workspaceId={workspace.id} />
    </div>
  );
}
