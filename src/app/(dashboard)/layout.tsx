import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaces } from "@/lib/queries";
import { ACTIVE_WORKSPACE_COOKIE } from "@/lib/utils";
import { SetupNotice } from "@/components/setup-notice";
import { Sidebar } from "@/components/sidebar";
import { cookies } from "next/headers";
import type { Workspace } from "@/types";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  if (!supabase) return <SetupNotice />;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaces = await listWorkspaces(supabase).catch(() => [] as Workspace[]);
  if (workspaces.length === 0) redirect("/onboarding");

  const cookieStore = await cookies();
  const picked = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  const active = workspaces.find((w) => w.id === picked) ?? workspaces[0];

  return (
    <div className="flex min-h-screen">
      <Sidebar
        workspaces={workspaces}
        activeWorkspaceId={active.id}
        userEmail={user.email ?? ""}
      />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
