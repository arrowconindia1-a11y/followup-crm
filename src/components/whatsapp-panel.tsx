"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn, formatDateTime, normalizePhoneClient } from "@/lib/utils";

interface PanelLead {
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  status: string;
}

interface OptInRow {
  lead_id: string | null;
  phone: string;
  status: "unknown" | "opted_in" | "opted_out";
  method: string | null;
  note: string | null;
  recorded_at: string;
}

interface PanelMessage {
  id: string;
  lead_id: string | null;
  direction: "inbound" | "outbound";
  body: string;
  status: string;
  error: string | null;
  created_at: string;
}

interface PanelEvent {
  id: number;
  event_type: string;
  phone: string | null;
  received_at: string;
}

interface PanelData {
  config: {
    credentials_set: boolean;
    verify_token_set: boolean;
    allowed_recipients: number;
    service_role_set: boolean;
  };
  leads: PanelLead[];
  optins_by_phone: Record<string, OptInRow>;
  messages: PanelMessage[];
  events: PanelEvent[];
}

const STATUS_TONE: Record<string, string> = {
  opted_in: "bg-emerald-100 text-emerald-700",
  opted_out: "bg-rose-100 text-rose-600",
  unknown: "bg-gray-100 text-gray-500",
};

export function WhatsAppPanel({ workspaceId }: { workspaceId: string }) {
  const [data, setData] = useState<PanelData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<string>("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/whatsapp/panel?workspace_id=${workspaceId}`);
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error?.message ?? "Failed to load panel");
      setData(j.data as PanelData);
      setLoadError(null);
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
    // poll for delivery-status updates (sent → delivered → read)
    pollRef.current = setInterval(() => void load(), 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [load]);

  const lead = data?.leads.find((l) => l.id === selectedLead) ?? null;
  const optin: OptInRow | undefined = lead?.phone
    ? data?.optins_by_phone[normalizePhoneClient(lead.phone)]
    : undefined;

  async function setOpt(decision: "opt_in" | "opt_out") {
    if (!lead) return;
    setFlash(null);
    const note =
      decision === "opt_in"
        ? window.prompt(
            "How was consent obtained? (form, in person, verbal…)",
            "manual"
          )
        : window.prompt("Reason for opt-out?", "manual");
    if (note === null) return; // cancelled

    const res = await fetch(`/api/leads/${lead.id}/opt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note: note || undefined }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      setFlash({ tone: "err", text: j?.error?.message ?? "Failed" });
      return;
    }
    setFlash({ tone: "ok", text: `Consent updated: ${decision === "opt_in" ? "opted in" : "opted out"}` });
    void load();
  }

  async function send() {
    if (!lead || !body.trim()) return;
    setSending(true);
    setFlash(null);
    const res = await fetch("/api/whatsapp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: lead.id, body: body.trim() }),
    });
    const j = await res.json().catch(() => null);
    setSending(false);
    if (!res.ok) {
      setFlash({ tone: "err", text: j?.error?.message ?? "Send failed" });
      return;
    }
    setBody("");
    setFlash({ tone: "ok", text: "Sent — watch for delivered/read ticks below." });
    void load();
  }

  if (loadError && !data) {
    return (
      <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
        {loadError}
      </p>
    );
  }

  const cfg = data?.config;

  return (
    <div className="space-y-6">
      {/* Sandbox safety banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <b>Sandbox mode.</b> Sends are hard-restricted to numbers listed in{" "}
        <code>WHATSAPP_ALLOWED_RECIPIENTS</code> (Meta lets you verify up to 5
        test recipients). With no allowlist entries, sending is disabled
        entirely — a real Business number can never be reached from this app.
      </div>

      {/* Config status */}
      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">
          Configuration (server env)
        </h2>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <ConfigRow ok={Boolean(cfg?.credentials_set)} label="WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID" />
          <ConfigRow ok={Boolean(cfg?.verify_token_set)} label="WHATSAPP_VERIFY_TOKEN (webhook handshake)" />
          <ConfigRow
            ok={(cfg?.allowed_recipients ?? 0) > 0}
            label={`WHATSAPP_ALLOWED_RECIPIENTS (${cfg?.allowed_recipients ?? 0} set)`}
          />
          <ConfigRow ok={Boolean(cfg?.service_role_set)} label="SUPABASE_SERVICE_ROLE_KEY (webhook writes)" />
        </div>
        {(!cfg?.credentials_set || !cfg?.service_role_set) && (
          <p className="mt-3 text-xs text-gray-500">
            Missing values? Follow SETUP.md §11 (Meta app + test number +
            env vars), then restart the dev server / redeploy.
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Send panel */}
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">
            Send a test message
          </h2>

          <label className="label" htmlFor="wa-lead">
            Lead (with phone)
          </label>
          <select
            id="wa-lead"
            className="input mb-3"
            value={selectedLead}
            onChange={(e) => setSelectedLead(e.target.value)}
          >
            <option value="">Select a lead…</option>
            {data?.leads.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} — {l.phone}
              </option>
            ))}
          </select>

          {lead && (
            <div className="mb-3 flex items-center gap-2 text-sm">
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  STATUS_TONE[optin?.status ?? "unknown"]
                )}
              >
                {optin?.status === "opted_in"
                  ? "Opted in"
                  : optin?.status === "opted_out"
                    ? "Opted out"
                    : "No consent recorded"}
              </span>
              <button className="btn-secondary btn-sm" onClick={() => setOpt("opt_in")}>
                Mark opted-in
              </button>
              <button className="btn-danger btn-sm" onClick={() => setOpt("opt_out")}>
                Mark opted-out
              </button>
            </div>
          )}
          {optin?.note && (
            <p className="mb-3 text-xs text-gray-400">
              Consent note: {optin.note} ({optin.method}, {formatDateTime(optin.recorded_at)})
            </p>
          )}

          <textarea
            rows={3}
            className="input"
            placeholder="Message body (plain text)…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />

          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={send}
              disabled={
                sending ||
                !lead ||
                !body.trim() ||
                optin?.status !== "opted_in" ||
                !cfg?.credentials_set
              }
              className="btn-primary"
            >
              {sending ? "Sending…" : "Send via sandbox"}
            </button>
            {lead && optin?.status !== "opted_in" && (
              <span className="text-xs text-gray-400">
                Requires opted-in consent (lead can also message you first, or
                send STOP/START keywords).
              </span>
            )}
          </div>

          {flash && (
            <p
              className={cn(
                "mt-3 rounded-lg px-3 py-2 text-sm",
                flash.tone === "ok"
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-rose-50 text-rose-700"
              )}
            >
              {flash.text}
            </p>
          )}
        </section>

        {/* Activity */}
        <section className="card p-5">
          <h2 className="mb-3 text-sm font-semibold text-gray-800">
            Recent messages
          </h2>
          {(!data?.messages || data.messages.length === 0) ? (
            <p className="text-sm text-gray-400">
              No WhatsApp messages yet. Inbound messages appear here once the
              webhook is subscribed in Meta App Dashboard.
            </p>
          ) : (
            <ul className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {data.messages.map((m) => (
                <li
                  key={m.id}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm",
                    m.direction === "outbound"
                      ? "ml-6 bg-brand-50 text-gray-800"
                      : "mr-6 bg-gray-100 text-gray-800"
                  )}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className="mt-1 text-[11px] text-gray-400">
                    {m.direction === "outbound" ? "You" : "Lead"} ·{" "}
                    {formatDateTime(m.created_at)} ·{" "}
                    <b>
                      {m.status === "read"
                        ? "read ✓✓"
                        : m.status === "delivered"
                          ? "delivered ✓✓"
                          : m.status}
                    </b>
                    {m.error ? ` — ${m.error}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <h2 className="mb-2 mt-5 text-sm font-semibold text-gray-800">
            Webhook events
          </h2>
          {(!data?.events || data.events.length === 0) ? (
            <p className="text-sm text-gray-400">No webhook events yet.</p>
          ) : (
            <ul className="space-y-1">
              {data.events.map((e) => (
                <li key={e.id} className="flex justify-between text-xs text-gray-500">
                  <span>
                    <code className="rounded bg-gray-100 px-1">{e.event_type}</code>{" "}
                    {e.phone ? `· ${e.phone}` : ""}
                  </span>
                  <span>{formatDateTime(e.received_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function ConfigRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
          ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"
        )}
      >
        {ok ? "✓" : "✗"}
      </span>
      <span className={ok ? "text-gray-700" : "text-gray-500"}>{label}</span>
    </div>
  );
}
