"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn, dueLabel, STATUS_LABELS } from "@/lib/utils";
import { LEAD_STATUSES, type Lead, type LeadStatus } from "@/types";

const LIMIT = 20;

export function LeadsTable({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<Lead[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        workspace_id: workspaceId,
        page: String(page),
        limit: String(LIMIT),
      });
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());

      const res = await fetch(`/api/leads?${params.toString()}`);
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error?.message ?? "Failed to load leads");
      setItems(j.data as Lead[]);
      setTotal(j.meta?.total ?? 0);
      setMessage(null);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, page, statusFilter, search, reloadKey]);

  // Debounced reload whenever filters change
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  async function changeStatus(lead: Lead, status: LeadStatus) {
    const previous = items;
    setItems(items.map((l) => (l.id === lead.id ? { ...l, status } : l)));
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error?.message ?? "Update failed");
      }
    } catch (e) {
      setItems(previous);
      setMessage((e as Error).message);
    }
  }

  async function remove(lead: Lead) {
    if (!confirm(`Delete lead "${lead.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error?.message ?? "Delete failed");
      }
      setReloadKey((k) => k + 1);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  async function seedDemo() {
    setMessage(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("seed_demo_data", {
      p_workspace_id: workspaceId,
    });
    if (error) {
      setMessage(error.message);
      return;
    }
    setMessage(`Added ${data} sample leads.`);
    setPage(1);
    setReloadKey((k) => k + 1);
  }

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));
  const from = total === 0 ? 0 : (page - 1) * LIMIT + 1;
  const to = Math.min(total, page * LIMIT);

  return (
    <div className="card">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 p-4">
        <input
          type="search"
          className="input max-w-xs"
          placeholder="Search name, phone, company…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <select
          className="input w-44"
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-gray-400">
          {loading ? "Loading…" : `${total} lead${total === 1 ? "" : "s"}`}
        </span>
      </div>

      {message && (
        <p className="border-b border-gray-100 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {message}
        </p>
      )}

      {/* Table */}
      {items.length === 0 && !loading ? (
        <div className="px-4 py-14 text-center">
          <p className="text-sm font-medium text-gray-700">No leads found</p>
          <p className="mt-1 text-sm text-gray-400">
            Add one manually, or drop in sample data to explore.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <Link href="/leads/new" className="btn-primary">
              + Add lead
            </Link>
            <button onClick={seedDemo} className="btn-secondary">
              Load 8 sample leads
            </button>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-100 bg-gray-50/60">
              <tr>
                <th className="th">Name</th>
                <th className="th">Phone</th>
                <th className="th hidden md:table-cell">Source</th>
                <th className="th">Status</th>
                <th className="th">Next follow-up</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((lead) => {
                const due = dueLabel(lead.next_follow_up_at);
                return (
                  <tr key={lead.id} className="hover:bg-gray-50/60">
                    <td className="td">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-medium text-gray-900 hover:text-brand-600"
                      >
                        {lead.name}
                      </Link>
                      {lead.company && (
                        <p className="text-xs text-gray-400">{lead.company}</p>
                      )}
                    </td>
                    <td className="td whitespace-nowrap">{lead.phone ?? "—"}</td>
                    <td className="td hidden md:table-cell">{lead.source ?? "—"}</td>
                    <td className="td">
                      <select
                        aria-label={`Status for ${lead.name}`}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-brand-600 focus:outline-none"
                        value={lead.status}
                        onChange={(e) =>
                          changeStatus(lead, e.target.value as LeadStatus)
                        }
                      >
                        {LEAD_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="td whitespace-nowrap">
                      <span
                        className={cn(
                          "text-xs",
                          due.tone === "overdue" && "font-medium text-rose-600",
                          due.tone === "today" && "font-medium text-amber-600",
                          due.tone !== "overdue" && due.tone !== "today" && "text-gray-500"
                        )}
                      >
                        {due.text}
                      </span>
                    </td>
                    <td className="td text-right">
                      <Link
                        href={`/leads/${lead.id}`}
                        className="btn-secondary btn-sm mr-2"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => remove(lead)}
                        className="btn-danger btn-sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
          <p className="text-xs text-gray-400">
            Showing {from}–{to} of {total}
          </p>
          <div className="flex gap-2">
            <button
              className="btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              ← Prev
            </button>
            <span className="px-2 py-1.5 text-xs text-gray-500">
              Page {page} / {totalPages}
            </span>
            <button
              className="btn-secondary btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
