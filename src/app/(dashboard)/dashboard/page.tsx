import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkspace, getDashboard } from "@/lib/queries";
import { StatusBadge } from "@/components/status-badge";
import {
  cn,
  dueLabel,
  formatDate,
  STATUS_BAR_CLASS,
  STATUS_LABELS,
} from "@/lib/utils";
import type { LeadStatus } from "@/types";

export const metadata: Metadata = { title: "Dashboard" };

const PIPELINE_KEYS: LeadStatus[] = [
  "new",
  "contacted",
  "qualified",
  "proposal_sent",
  "won",
  "lost",
  "dead",
];

export default async function DashboardPage() {
  const supabase = await createClient();
  if (!supabase) redirect("/");

  const workspace = await getActiveWorkspace(supabase);
  if (!workspace) redirect("/onboarding");

  let dashboard;
  let dbError: string | null = null;
  try {
    dashboard = await getDashboard(supabase, workspace.id);
  } catch (e) {
    dbError = (e as Error).message;
  }

  const taskStats = dashboard?.tasks ?? { open: 0, overdue: 0 };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-gray-500">
          {workspace.name} · follow-up health at a glance
        </p>
      </header>

      {dbError && (
        <div className="card mb-6 border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <p className="font-semibold">Couldn&apos;t load dashboard data.</p>
          <p className="mt-1">
            Most likely the database migrations haven&apos;t been run yet. Run
            files 0001–0003 from <code>supabase/migrations/</code> in the
            Supabase SQL Editor, then reload. ({dbError})
          </p>
        </div>
      )}

      {!dbError && dashboard && (
        <>
          {/* KPI cards */}
          <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Total leads" value={dashboard.metrics.total_leads} sub={`${dashboard.metrics.leads_7d} added in 7 days`} />
            <Kpi label="New" value={dashboard.metrics.new_leads} sub="not contacted yet" />
            <Kpi
              label="Follow-ups today"
              value={dashboard.metrics.followups_today}
              sub="due today"
              accent={dashboard.metrics.followups_today > 0 ? "brand" : undefined}
            />
            <Kpi
              label="Overdue"
              value={dashboard.metrics.followups_overdue}
              sub="need attention"
              accent={dashboard.metrics.followups_overdue > 0 ? "rose" : undefined}
            />
            <Kpi label="Won this month" value={dashboard.metrics.won_this_month} sub="closed deals" accent="emerald" />
            <div className="card p-4">
              <p className="text-sm text-gray-500">Open tasks</p>
              <p className="mt-1 text-2xl font-semibold">{taskStats.open}</p>
              <p className="text-xs text-gray-400">
                {taskStats.overdue} overdue
              </p>
            </div>
          </div>

          {/* Pipeline */}
          <section className="card mb-8 p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-800">Pipeline</h2>
            {dashboard.metrics.total_leads === 0 ? (
              <p className="text-sm text-gray-500">
                No leads yet —{" "}
                <Link href="/leads" className="font-medium text-brand-600 hover:underline">
                  add your first lead
                </Link>
                .
              </p>
            ) : (
              <>
                <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
                  {PIPELINE_KEYS.map((status) => {
                    const value =
                      dashboard.metrics[
                        {
                          new: "new_leads",
                          contacted: "contacted",
                          qualified: "qualified",
                          proposal_sent: "proposals",
                          won: "won",
                          lost: "lost",
                          dead: "lost",
                        }[status] as
                          | "new_leads"
                          | "contacted"
                          | "qualified"
                          | "proposals"
                          | "won"
                          | "lost"
                      ];
                    if (status === "dead") return null;
                    const pct = (value / dashboard.metrics.total_leads) * 100;
                    if (pct <= 0) return null;
                    return (
                      <div
                        key={status}
                        className={STATUS_BAR_CLASS[status]}
                        style={{ width: `${pct}%` }}
                        title={`${STATUS_LABELS[status]}: ${value}`}
                      />
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                  {PIPELINE_KEYS.filter((s) => s !== "dead").map((status) => {
                    const value =
                      dashboard.metrics[
                        {
                          new: "new_leads",
                          contacted: "contacted",
                          qualified: "qualified",
                          proposal_sent: "proposals",
                          won: "won",
                          lost: "lost",
                        }[status] as
                          | "new_leads"
                          | "contacted"
                          | "qualified"
                          | "proposals"
                          | "won"
                          | "lost"
                      ];
                    return (
                      <span key={status} className="flex items-center gap-1.5 text-xs text-gray-600">
                        <span className={cn("h-2 w-2 rounded-full", STATUS_BAR_CLASS[status])} />
                        {STATUS_LABELS[status]}: <b>{value}</b>
                      </span>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          {/* Lists */}
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800">Needs follow-up</h2>
                <Link href="/leads" className="text-xs font-medium text-brand-600 hover:underline">
                  All leads →
                </Link>
              </div>
              {dashboard.followups.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">
                  Nothing due — enjoy the calm 🌤
                </p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {dashboard.followups.map((lead) => {
                    const due = dueLabel(lead.next_follow_up_at);
                    return (
                      <li key={lead.id}>
                        <Link
                          href={`/leads/${lead.id}`}
                          className="flex items-center justify-between gap-3 py-2.5 hover:bg-gray-50"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-gray-800">{lead.name}</p>
                            <p className="text-xs text-gray-400">{lead.phone ?? "no phone"}</p>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <StatusBadge status={lead.status} />
                            <span
                              className={cn(
                                "w-28 text-right text-xs",
                                due.tone === "overdue" && "font-medium text-rose-600",
                                due.tone === "today" && "font-medium text-amber-600",
                                (due.tone === "soon" || due.tone === "later" || due.tone === "none") &&
                                  "text-gray-500"
                              )}
                            >
                              {due.text}
                            </span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800">Recent leads</h2>
                <Link href="/leads/new" className="text-xs font-medium text-brand-600 hover:underline">
                  + Add lead
                </Link>
              </div>
              {dashboard.recent.length === 0 ? (
                <p className="py-6 text-center text-sm text-gray-400">No leads yet.</p>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {dashboard.recent.map((lead) => (
                    <li key={lead.id}>
                      <Link
                        href={`/leads/${lead.id}`}
                        className="flex items-center justify-between gap-3 py-2.5 hover:bg-gray-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-800">{lead.name}</p>
                          <p className="text-xs text-gray-400">
                            {lead.company ?? lead.source ?? "—"} · added {formatDate(lead.created_at)}
                          </p>
                        </div>
                        <StatusBadge status={lead.status} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <p className="mt-8 text-xs text-gray-400">
            Tip: use the <Link href="/assistant" className="font-medium text-brand-600 hover:underline">AI Assistant</Link> to
            create follow-up tasks from a single sentence — nothing is written until you approve it.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number;
  sub: string;
  accent?: "brand" | "rose" | "emerald";
}) {
  return (
    <div className="card p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold",
          accent === "rose" && value > 0 && "text-rose-600",
          accent === "emerald" && "text-emerald-600",
          accent === "brand" && value > 0 && "text-brand-600"
        )}
      >
        {value}
      </p>
      <p className="text-xs text-gray-400">{sub}</p>
    </div>
  );
}
