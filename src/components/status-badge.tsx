import { STATUS_BADGE_CLASS, STATUS_LABELS, cn } from "@/lib/utils";
import type { LeadStatus } from "@/types";

export function StatusBadge({ status }: { status: LeadStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        STATUS_BADGE_CLASS[status]
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
