import type { LeadStatus } from "@/types";

/** Cookie that stores the user's active workspace id (client-safe module). */
export const ACTIVE_WORKSPACE_COOKIE = "fcrm_ws";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  proposal_sent: "Proposal sent",
  won: "Won",
  lost: "Lost",
  dead: "Dead",
};

export const STATUS_BADGE_CLASS: Record<LeadStatus, string> = {
  new: "bg-sky-100 text-sky-700 ring-sky-200",
  contacted: "bg-violet-100 text-violet-700 ring-violet-200",
  qualified: "bg-amber-100 text-amber-700 ring-amber-200",
  proposal_sent: "bg-indigo-100 text-indigo-700 ring-indigo-200",
  won: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  lost: "bg-rose-100 text-rose-700 ring-rose-200",
  dead: "bg-gray-100 text-gray-500 ring-gray-200",
};

export const STATUS_BAR_CLASS: Record<LeadStatus, string> = {
  new: "bg-sky-500",
  contacted: "bg-violet-500",
  qualified: "bg-amber-500",
  proposal_sent: "bg-indigo-500",
  won: "bg-emerald-500",
  lost: "bg-rose-400",
  dead: "bg-gray-300",
};

const DATE_OPTS: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Calcutta",
};

const DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  ...DATE_OPTS,
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
};

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", DATE_OPTS);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", DATETIME_OPTS);
}

export function dueLabel(iso: string | null | undefined): {
  text: string;
  tone: "overdue" | "today" | "soon" | "later" | "none";
} {
  if (!iso) return { text: "No follow-up set", tone: "none" };
  const now = new Date();
  const due = new Date(iso);
  if (due < now) {
    const days = Math.floor((now.getTime() - due.getTime()) / 86_400_000);
    return {
      text: days >= 1 ? `Overdue by ${days}d` : "Overdue (today)",
      tone: "overdue",
    };
  }
  const sameDay = due.toDateString() === now.toDateString();
  if (sameDay) return { text: "Due today", tone: "today" };
  const days = Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
  if (days <= 3) return { text: `In ${days}d`, tone: "soon" };
  return { text: formatDate(iso), tone: "later" };
}

/** Convert an ISO timestamp to a value for <input type="datetime-local"> */
export function toLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

/** Digits-only phone normalization (client-safe copy of the server one). */
export function normalizePhoneClient(raw: string | null | undefined): string {
  if (!raw) return "";
  let digits = raw.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits;
}


