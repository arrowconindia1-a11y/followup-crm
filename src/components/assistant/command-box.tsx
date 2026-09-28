"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PreviewIntent, ApplyOutcome } from "@/lib/ai/apply";
import { cn, formatDateTime } from "@/lib/utils";
import type { AiCommandHistoryRow } from "@/types";

interface CommandResponse {
  command_id: string;
  understood: boolean;
  clarification: string;
  valid: boolean;
  errors: string[];
  preview: PreviewIntent[];
  model: string;
  latency_ms: number;
  tokens: { prompt: number; candidates: number } | null;
}

const EXAMPLES = [
  "Follow up with Rahul Sharma tomorrow 5pm about the kitchen quote, urgent",
  "Mark Priya Nair as qualified",
  "New lead Amit Verma from Verma Builders, phone +91 98100 12345",
  "Remind me to call Anita about warranty terms on Monday",
];

const TYPE_ICON: Record<string, string> = {
  create_task: "✓",
  create_lead: "+",
  update_lead_status: "⇄",
  set_followup: "⏰",
  add_note: "✎",
};

const COOLDOWN_MS = 4000; // client-side free-tier RPM guard

export function CommandBox({ workspaceId }: { workspaceId: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"parse" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CommandResponse | null>(null);
  const [resolutions, setResolutions] = useState<Record<number, string>>({});
  const [applyResults, setApplyResults] = useState<ApplyOutcome[] | null>(null);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [history, setHistory] = useState<AiCommandHistoryRow[]>([]);
  const cooldownTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/ai/command?workspace_id=${workspaceId}`);
      const j = await res.json().catch(() => null);
      if (res.ok) setHistory(j.data as AiCommandHistoryRow[]);
    } catch {
      /* history is non-critical */
    }
  }, [workspaceId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    cooldownTimer.current = setInterval(() => setNow(Date.now()), 500);
    return () => {
      if (cooldownTimer.current) clearInterval(cooldownTimer.current);
    };
  }, []);

  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  async function parse() {
    if (!text.trim() || busy) return;
    setBusy("parse");
    setError(null);
    setResult(null);
    setApplyResults(null);
    setResolutions({});

    try {
      const res = await fetch("/api/ai/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim(), workspace_id: workspaceId }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) {
        setError(j?.error?.message ?? "Parsing failed.");
        return;
      }
      setResult(j.data as CommandResponse);
      setCooldownUntil(Date.now() + COOLDOWN_MS);
      void loadHistory();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    if (!result || busy) return;
    setBusy("apply");
    setError(null);
    try {
      const res = await fetch(`/api/ai/command/${result.command_id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resolutions: Object.entries(resolutions).map(([index, lead_id]) => ({
            index: Number(index),
            lead_id,
          })),
        }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok && res.status !== 207) {
        setError(j?.error?.message ?? "Apply failed.");
        return;
      }
      setApplyResults(j.data.results as ApplyOutcome[]);
      setResult(null);
      setText("");
      void loadHistory();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const hasUnresolved =
    result?.preview.some(
      (p) =>
        p.blocked_reason &&
        p.lead.status === "ambiguous" &&
        !resolutions[p.index]
    ) ?? false;

  return (
    <div className="space-y-6">
      {/* Command input */}
      <section className="card p-5">
        <label className="label" htmlFor="command">
          Command
        </label>
        <textarea
          id="command"
          rows={3}
          className="input"
          placeholder='e.g. "Follow up with Rahul Sharma tomorrow 5pm about the kitchen quote"'
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void parse();
          }}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setText(ex)}
              className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-500 hover:border-brand-600 hover:text-brand-600"
            >
              {ex.length > 46 ? `${ex.slice(0, 46)}…` : ex}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={parse}
            disabled={busy !== null || !text.trim() || cooldownLeft > 0}
            className="btn-primary"
          >
            {busy === "parse"
              ? "Parsing…"
              : cooldownLeft > 0
                ? `Wait ${cooldownLeft}s…`
                : "Parse command"}
          </button>
          <p className="text-xs text-gray-400">
            Gemini Flash free tier · nothing is written until you approve ·
            ⌘/Ctrl+Enter
          </p>
        </div>
      </section>

      {error && (
        <p className="rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      )}

      {applyResults && (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">
            Applied {applyResults.filter((r) => r.ok).length} of{" "}
            {applyResults.length} action(s):
          </p>
          <ul className="mt-2 space-y-1 text-sm text-emerald-800">
            {applyResults.map((r) => (
              <li key={r.index}>
                {r.ok ? "✓" : "✗"} {r.detail}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Parsed preview + approval */}
      {result && (
        <section className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-800">
              Parsed preview — approve before anything is saved
            </h2>
            <span className="text-xs text-gray-400">
              {result.model} · {(result.latency_ms / 1000).toFixed(1)}s
              {result.tokens
                ? ` · ${result.tokens.prompt + result.tokens.candidates} tokens`
                : ""}
            </span>
          </div>

          {!result.understood ? (
            <p className="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-800">
              {result.clarification || "I didn't understand that command."}
            </p>
          ) : (
            <>
              {result.errors.length > 0 && (
                <div className="mb-3 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p className="font-semibold">Validation errors:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {result.errors.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              )}

              <ul className="space-y-3">
                {result.preview.map((intent) => (
                  <li
                    key={intent.index}
                    className={cn(
                      "rounded-lg border p-3",
                      intent.blocked_reason
                        ? "border-amber-200 bg-amber-50/50"
                        : "border-gray-200"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm text-brand-600">
                        {TYPE_ICON[intent.type] ?? "•"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-800">
                          {intent.description}
                        </p>

                        {intent.lead.status === "matched" && (
                          <p className="mt-1 text-xs text-emerald-600">
                            Lead matched: {intent.lead.lead.name}
                            {intent.lead.lead.company
                              ? ` (${intent.lead.lead.company})`
                              : ""}
                          </p>
                        )}

                        {intent.lead.status === "ambiguous" && (
                          <div className="mt-2">
                            <label className="mb-1 block text-xs text-gray-500">
                              Which lead?
                            </label>
                            <select
                              className="input max-w-xs py-1 text-xs"
                              value={resolutions[intent.index] ?? ""}
                              onChange={(e) =>
                                setResolutions((r) => ({
                                  ...r,
                                  [intent.index]: e.target.value,
                                }))
                              }
                            >
                              <option value="">Select…</option>
                              {intent.lead.candidates.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                  {c.company ? ` — ${c.company}` : ""}
                                  {c.phone ? ` — ${c.phone}` : ""}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {intent.lead.status === "not_found" &&
                          intent.type === "create_task" && (
                            <p className="mt-1 text-xs text-gray-400">
                              No matching lead — task will be created without a
                              lead link.
                            </p>
                          )}

                        {intent.blocked_reason && (
                          <p className="mt-1 text-xs font-medium text-amber-700">
                            {intent.blocked_reason}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-center gap-3 border-t border-gray-100 pt-4">
                <button
                  onClick={apply}
                  disabled={
                    busy !== null || !result.valid || hasUnresolved
                  }
                  className="btn-primary"
                >
                  {busy === "apply" ? "Applying…" : "Approve & apply"}
                </button>
                <button
                  onClick={() => {
                    setResult(null);
                    setResolutions({});
                  }}
                  className="btn-secondary"
                >
                  Reject
                </button>
                {hasUnresolved && (
                  <span className="text-xs text-amber-600">
                    Pick a lead for every ambiguous match first.
                  </span>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {/* History / audit */}
      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">
          Recent commands
        </h2>
        {history.length === 0 ? (
          <p className="text-sm text-gray-400">
            No commands yet — your parsed commands and approvals appear here.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {history.map((row) => (
              <li key={row.id} className="flex items-center gap-3 py-2">
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                    row.applied
                      ? "bg-emerald-100 text-emerald-700"
                      : row.valid
                        ? "bg-sky-100 text-sky-700"
                        : "bg-rose-100 text-rose-600"
                  )}
                >
                  {row.applied ? "applied" : row.valid ? "parsed" : "rejected"}
                </span>
                <p className="min-w-0 flex-1 truncate text-sm text-gray-700">
                  {row.raw_text}
                </p>
                <span className="shrink-0 text-xs text-gray-400">
                  {formatDateTime(row.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
