"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  LEAD_STATUSES,
  type Lead,
  type LeadStatus,
} from "@/types";
import { STATUS_LABELS, toLocalInputValue } from "@/lib/utils";

const SOURCES = ["website", "referral", "instagram", "walk-in", "csv_import", "manual"];

export function LeadForm({
  mode,
  workspaceId,
  lead,
}: {
  mode: "create" | "edit";
  workspaceId?: string;
  lead?: Lead;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: lead?.name ?? "",
    phone: lead?.phone ?? "",
    email: lead?.email ?? "",
    company: lead?.company ?? "",
    source: lead?.source ?? "",
    status: (lead?.status ?? "new") as LeadStatus,
    notes: lead?.notes ?? "",
    next_follow_up_at: toLocalInputValue(lead?.next_follow_up_at),
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const payload = {
      ...(mode === "create" ? { workspace_id: workspaceId } : {}),
      name: form.name,
      phone: form.phone,
      email: form.email,
      company: form.company,
      source: form.source,
      status: form.status,
      notes: form.notes,
      next_follow_up_at: form.next_follow_up_at
        ? new Date(form.next_follow_up_at).toISOString()
        : "",
    };

    const res = await fetch(mode === "create" ? "/api/leads" : `/api/leads/${lead!.id}`, {
      method: mode === "create" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => null);
    setSaving(false);

    if (!res.ok) {
      setError(j?.error?.message ?? "Could not save lead.");
      return;
    }
    router.push("/leads");
    router.refresh();
  }

  async function onDelete() {
    if (!lead) return;
    if (!confirm(`Delete lead "${lead.name}"? This cannot be undone.`)) return;
    setSaving(true);
    const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
    setSaving(false);
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      setError(j?.error?.message ?? "Could not delete lead.");
      return;
    }
    router.push("/leads");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-5 p-6">
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">
            Name *
          </label>
          <input
            id="name"
            className="input"
            required
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Rahul Sharma"
          />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            Phone
          </label>
          <input
            id="phone"
            className="input"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            placeholder="+91 98xxx xxxxx"
          />
        </div>
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            className="input"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="rahul@example.com"
          />
        </div>
        <div>
          <label className="label" htmlFor="company">
            Company
          </label>
          <input
            id="company"
            className="input"
            value={form.company}
            onChange={(e) => set("company", e.target.value)}
            placeholder="Sharma Interiors"
          />
        </div>
        <div>
          <label className="label" htmlFor="source">
            Source
          </label>
          <input
            id="source"
            className="input"
            list="source-options"
            value={form.source}
            onChange={(e) => set("source", e.target.value)}
            placeholder="referral"
          />
          <datalist id="source-options">
            {SOURCES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="label" htmlFor="status">
            Status
          </label>
          <select
            id="status"
            className="input"
            value={form.status}
            onChange={(e) => set("status", e.target.value as LeadStatus)}
          >
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="followup">
            Next follow-up
          </label>
          <input
            id="followup"
            type="datetime-local"
            className="input"
            value={form.next_follow_up_at}
            onChange={(e) => set("next_follow_up_at", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="notes">
            Notes
          </label>
          <textarea
            id="notes"
            rows={3}
            className="input"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            placeholder="What did you discuss? What comes next?"
          />
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3 border-t border-gray-100 pt-5">
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? "Saving…" : mode === "create" ? "Create lead" : "Save changes"}
        </button>
        {mode === "edit" && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving}
            className="btn-danger"
          >
            Delete lead
          </button>
        )}
        <Link href="/leads" className="btn-secondary ml-auto">
          Cancel
        </Link>
      </div>
    </form>
  );
}
