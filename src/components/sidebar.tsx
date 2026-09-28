"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn, ACTIVE_WORKSPACE_COOKIE } from "@/lib/utils";
import type { Workspace } from "@/types";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/leads", label: "Leads", icon: "☰" },
  { href: "/assistant", label: "Assistant", icon: "✦" },
  { href: "/tasks", label: "Tasks", icon: "✓" },
  { href: "/whatsapp", label: "WhatsApp", icon: "✆" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Sidebar({
  workspaces,
  activeWorkspaceId,
  userEmail,
}: {
  workspaces: Workspace[];
  activeWorkspaceId: string;
  userEmail: string;
}) {
  const pathname = usePathname();
  const router = useRouter();

  function switchWorkspace(id: string) {
    document.cookie = `${ACTIVE_WORKSPACE_COOKIE}=${id}; path=/; max-age=31536000`;
    router.refresh();
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-base text-white">
          ⚡
        </span>
        <div className="leading-tight">
          <p className="text-sm font-semibold">FollowUp AI</p>
          <p className="text-[11px] uppercase tracking-wide text-gray-400">CRM</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <span aria-hidden className="w-4 text-center">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 p-3">
        {workspaces.length > 1 ? (
          <select
            aria-label="Switch workspace"
            className="input mb-2 text-xs"
            value={activeWorkspaceId}
            onChange={(e) => switchWorkspace(e.target.value)}
          >
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="mb-1 truncate px-1 text-sm font-medium text-gray-800">
            {workspaces.find((w) => w.id === activeWorkspaceId)?.name ??
              workspaces[0]?.name}
          </p>
        )}
        <p className="truncate px-1 text-xs text-gray-400">{userEmail}</p>
        <button
          onClick={signOut}
          className="mt-2 w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-800"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
