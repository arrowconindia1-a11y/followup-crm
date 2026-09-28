import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/queries";
import { CommandBox } from "@/components/assistant/command-box";

export const metadata: Metadata = { title: "AI Assistant" };

export default async function AssistantPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/");

  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">AI Assistant</h1>
        <p className="text-sm text-gray-500">
          Type a follow-up instruction in plain language — Gemini parses it,
          you approve every write.
        </p>
      </header>

      <CommandBox workspaceId={workspace.id} />
    </div>
  );
}
