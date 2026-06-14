import type { DisplayStatus } from "@/app/lib/maintenance";

// Shared visual language for maintenance status across the My Products pages.
const STYLE: Record<
  DisplayStatus,
  { label: string; dot: string; chip: string }
> = {
  OVERDUE: {
    label: "Overdue",
    dot: "bg-rose-500",
    chip: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900",
  },
  DUE_SOON: {
    label: "Due soon",
    dot: "bg-amber-500",
    chip: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900",
  },
  OK: {
    label: "On track",
    dot: "bg-emerald-500",
    chip: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900",
  },
};

export function StatusBadge({
  status,
  className = "",
}: {
  status: DisplayStatus;
  className?: string;
}) {
  const s = STYLE[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${s.chip} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export const STATUS_STYLE = STYLE;
