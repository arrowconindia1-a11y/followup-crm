"use client";

import { useCallback, useEffect, useState } from "react";
import { cn, formatDateTime } from "@/lib/utils";

interface MemberRow {
  user_id: string;
  role: "owner" | "admin" | "member" | "viewer";
  joined_at: string;
  profiles: { email: string | null; full_name: string | null } | null;
}

interface InviteRow {
  id: string;
  email: string;
  role: string;
  created_at: string;
}

interface UsageData {
  period_month: string;
  usage: { ai_requests: number; whatsapp_sends: number };
  limits: { ai_requests: number; whatsapp_sends: number };
  plan: string;
  billing_status: string | null;
  stripe_configured: boolean;
}

const ROLES = ["owner", "admin", "member", "viewer"] as const;

export function SettingsPanel({ workspaceId }: { workspaceId: string }) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [myRole, setMyRole] = useState<string | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"admin" | "member" | "viewer">("member");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [mRes, uRes] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}/members`),
        fetch(`/api/usage?workspace_id=${workspaceId}`),
      ]);
      const mJ = await mRes.json().catch(() => null);
      const uJ = await uRes.json().catch(() => null);
      if (!mRes.ok) throw new Error(mJ?.error?.message ?? "Failed to load members");
      setMembers(mJ.data.members as MemberRow[]);
      setInvites(mJ.data.pending_invites as InviteRow[]);
      setMyRole(mJ.data.my_role as string);
      if (uRes.ok) setUsage(uJ.data as UsageData);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
    // Auto-check for a pending invite addressed to this user.
    fetch("/api/invites/accept", { method: "POST" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.data?.accepted?.length > 0) {
          setFlash({
            tone: "ok",
            text: `You joined ${j.data.accepted.length} workspace(s) via invite.`,
          });
          void load();
        }
      })
      .catch(() => {});
  }, [load]);

  // Stripe return banners
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const billing = params.get("billing");
    if (billing === "success") {
      setFlash({ tone: "ok", text: "Checkout completed — status syncs via the Stripe webhook (start `stripe listen` locally)." });
      void load();
    } else if (billing === "cancelled") {
      setFlash({ tone: "err", text: "Checkout cancelled." });
    }
  }, [load]);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFlash(null);
    const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setFlash({ tone: "err", text: j?.error?.message ?? "Invite failed" });
      return;
    }
    setInviteEmail("");
    setFlash({
      tone: "ok",
      text: j.data.email_sent
        ? `Invite sent to ${j.data.invite.email}.`
        : `Invite recorded for ${j.data.invite.email} (email not sent — they can sign up and accept here).`,
    });
    void load();
  }

  async function changeRole(userId: string, role: string) {
    setFlash(null);
    const res = await fetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) setFlash({ tone: "err", text: j?.error?.message ?? "Failed" });
    void load();
  }

  async function removeMember(userId: string, email: string) {
    if (!confirm(`Remove ${email} from the workspace?`)) return;
    setFlash(null);
    const res = await fetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
      method: "DELETE",
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) setFlash({ tone: "err", text: j?.error?.message ?? "Failed" });
    void load();
  }

  async function startCheckout() {
    setBusy(true);
    setFlash(null);
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: workspaceId }),
    });
    const j = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      setFlash({ tone: "err", text: j?.error?.message ?? "Checkout failed" });
      return;
    }
    window.location.href = j.data.url as string;
  }

  const canManage = myRole === "owner" || myRole === "admin";

  if (loadError && members.length === 0) {
    return (
      <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {loadError}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {flash && (
        <p
          className={cn(
            "rounded-lg px-4 py-3 text-sm",
            flash.tone === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
          )}
        >
          {flash.text}
        </p>
      )}

      {/* Team */}
      <section className="card p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Team</h2>
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">
            you: {myRole ?? "…"}
          </span>
        </div>

        <ul className="divide-y divide-gray-100">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {m.profiles?.full_name || m.profiles?.email || m.user_id}
                </p>
                <p className="text-xs text-gray-400">
                  {m.profiles?.email} · joined {formatDateTime(m.joined_at)}
                </p>
              </div>
              {canManage ? (
                <>
                  <select
                    className="input w-28 py-1 text-xs"
                    value={m.role}
                    onChange={(e) => changeRole(m.user_id, e.target.value)}
                    aria-label={`Role for ${m.profiles?.email ?? m.user_id}`}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn-danger btn-sm"
                    onClick={() => removeMember(m.user_id, m.profiles?.email ?? m.user_id)}
                  >
                    Remove
                  </button>
                </>
              ) : (
                <span className="text-xs text-gray-400">{m.role}</span>
              )}
            </li>
          ))}
        </ul>

        {invites.length > 0 && (
          <div className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
            Pending invites:{" "}
            {invites.map((i) => `${i.email} (${i.role})`).join(", ")}
          </div>
        )}

        {canManage && (
          <form onSubmit={sendInvite} className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-4">
            <input
              type="email"
              required
              className="input max-w-xs"
              placeholder="teammate@business.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <select
              className="input w-32"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "admin" | "member" | "viewer")}
            >
              <option value="admin">admin</option>
              <option value="member">member</option>
              <option value="viewer">viewer</option>
            </select>
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? "Inviting…" : "Invite"}
            </button>
          </form>
        )}
      </section>

      {/* Usage */}
      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">
          Usage this month{" "}
          <span className="font-normal text-gray-400">
            (resets on the 1st, UTC)
          </span>
        </h2>
        {usage ? (
          <div className="space-y-4">
            <UsageBar
              label="AI commands"
              value={usage.usage.ai_requests}
              limit={usage.limits.ai_requests}
            />
            <UsageBar
              label="WhatsApp sends"
              value={usage.usage.whatsapp_sends}
              limit={usage.limits.whatsapp_sends}
            />
          </div>
        ) : (
          <p className="text-sm text-gray-400">Loading usage…</p>
        )}
      </section>

      {/* Billing */}
      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">Billing</h2>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700">
            plan: {usage?.plan ?? "free"}
          </span>
          {usage?.billing_status && (
            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600">
              {usage.billing_status}
            </span>
          )}
          {canManage &&
            (usage?.stripe_configured ? (
              <button onClick={startCheckout} disabled={busy} className="btn-primary ml-auto">
                {busy ? "Redirecting…" : "Upgrade — Stripe test mode"}
              </button>
            ) : (
              <p className="ml-auto text-xs text-gray-400">
                Set STRIPE_SECRET_KEY (sk_test_…) + STRIPE_PRICE_ID to enable
                test checkout — see SETUP.md §12.
              </p>
            ))}
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Test mode only: no real charges, ever. Live billing is a deliberate
          launch-time decision (companion §19).
        </p>
      </section>
    </div>
  );
}

function UsageBar({ label, value, limit }: { label: string; value: number; limit: number }) {
  const pct = Math.min(100, Math.round((value / limit) * 100));
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-gray-500">
        <span>{label}</span>
        <span>
          {value} / {limit} ({pct}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={cn(
            "h-full rounded-full",
            pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-brand-600"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
