import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/queries";
import { TasksBoard } from "@/components/tasks-board";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/");

  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) redirect("/onboarding");

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <p className="text-sm text-gray-500">
          {workspace.name} · real task engine (Phase 2)
        </p>
      </header>

      <TasksBoard workspaceId={workspace.id} />
    </div>
  );
}
