"use client";

import { useState } from "react";
import { StatusBadge } from "@/app/components/StatusBadge";
import type { DisplayStatus } from "@/app/lib/maintenance";

const DAY_MS = 86_400_000;
const DUE_SOON_DAYS = 14;

/** Serializable shape passed from the server page (dates as ISO strings). */
export type MaintenanceItem = {
  statusId: string;
  taskId: string;
  title: string;
  intervalDays: number;
  sourceExcerpt: string | null;
  lastDoneAt: string | null;
  nextDueAt: string | null;
};

// Client mirror of app/lib/maintenance.ts so marking complete updates the badge
// instantly without a round-trip to re-render the server component.
function computeDisplay(nextDueAt: string | null): DisplayStatus {
  if (!nextDueAt) return "OK";
  const diffDays = (new Date(nextDueAt).getTime() - Date.now()) / DAY_MS;
  if (diffDays < 0) return "OVERDUE";
  if (diffDays <= DUE_SOON_DAYS) return "DUE_SOON";
  return "OK";
}

function daysUntil(nextDueAt: string | null): number | null {
  if (!nextDueAt) return null;
  return Math.ceil((new Date(nextDueAt).getTime() - Date.now()) / DAY_MS);
}

function progressOf(item: MaintenanceItem): number {
  if (!item.nextDueAt) return 0;
  const span = item.intervalDays * DAY_MS;
  if (span <= 0) return 1;
  const elapsed = Date.now() - (new Date(item.nextDueAt).getTime() - span);
  return Math.max(0, Math.min(1, elapsed / span));
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function dueLabel(item: MaintenanceItem): string {
  const d = daysUntil(item.nextDueAt);
  if (d == null) return "Not scheduled";
  if (d < 0) return `${Math.abs(d)} day${Math.abs(d) === 1 ? "" : "s"} overdue`;
  if (d === 0) return "Due today";
  return `Due in ${d} day${d === 1 ? "" : "s"}`;
}

const BAR: Record<DisplayStatus, string> = {
  OVERDUE: "bg-rose-500",
  DUE_SOON: "bg-amber-500",
  OK: "bg-emerald-500",
};

export function MaintenanceList({ initial }: { initial: MaintenanceItem[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [justDone, setJustDone] = useState<string | null>(null);

  async function markComplete(item: MaintenanceItem) {
    if (busy) return;
    setError(null);
    setBusy(item.statusId);
    try {
      const res = await fetch(`/api/maintenance/${item.statusId}/complete`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setItems((prev) =>
        prev.map((it) =>
          it.statusId === item.statusId
            ? {
                ...it,
                lastDoneAt: data.status.lastDoneAt,
                nextDueAt: data.status.nextDueAt,
              }
            : it,
        ),
      );
      setJustDone(item.statusId);
      setTimeout(() => setJustDone((c) => (c === item.statusId ? null : c)), 2200);
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  }

  // Re-sort most-urgent first on every render so a completed task drops down.
  const rank: Record<DisplayStatus, number> = { OVERDUE: 0, DUE_SOON: 1, OK: 2 };
  const sorted = [...items].sort((a, b) => {
    const da = computeDisplay(a.nextDueAt);
    const db = computeDisplay(b.nextDueAt);
    if (rank[da] !== rank[db]) return rank[da] - rank[db];
    const at = a.nextDueAt ? new Date(a.nextDueAt).getTime() : Infinity;
    const bt = b.nextDueAt ? new Date(b.nextDueAt).getTime() : Infinity;
    return at - bt;
  });

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-300 px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-700">
        No maintenance tasks defined for this product.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </div>
      )}

      {sorted.map((item) => {
        const display = computeDisplay(item.nextDueAt);
        const progress = progressOf(item);
        const pct = Math.round(progress * 100);
        const isBusy = busy === item.statusId;
        const celebrate = justDone === item.statusId;

        return (
          <div
            key={item.statusId}
            className={`rounded-2xl border bg-white p-5 transition-all dark:bg-zinc-900 ${
              celebrate
                ? "border-emerald-400 ring-2 ring-emerald-400/30 dark:border-emerald-600"
                : "border-zinc-200 dark:border-zinc-800"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="text-base font-semibold tracking-tight">
                    {item.title}
                  </h3>
                  <StatusBadge status={display} />
                  {celebrate && (
                    <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      ✓ logged
                    </span>
                  )}
                </div>
                {item.sourceExcerpt && (
                  <p className="mt-1 font-mono text-xs text-zinc-400">
                    {item.sourceExcerpt}
                  </p>
                )}
              </div>

              <button
                onClick={() => markComplete(item)}
                disabled={isBusy}
                className="shrink-0 rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {isBusy ? "Saving…" : "Mark complete"}
              </button>
            </div>

            {/* Interval progress toward next due date */}
            <div className="mt-4">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span
                  className={`font-medium ${
                    display === "OVERDUE"
                      ? "text-rose-600 dark:text-rose-400"
                      : display === "DUE_SOON"
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-zinc-500"
                  }`}
                >
                  {dueLabel(item)}
                </span>
                <span className="font-mono text-zinc-400">
                  every {item.intervalDays}d
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ${BAR[display]}`}
                  style={{ width: `${Math.max(4, pct)}%` }}
                />
              </div>
            </div>

            {/* Service record */}
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-3 text-xs dark:border-zinc-800">
              <div>
                <div className="text-zinc-400">Last serviced</div>
                <div className="mt-0.5 font-mono text-zinc-700 dark:text-zinc-300">
                  {fmtDate(item.lastDoneAt)}
                </div>
              </div>
              <div>
                <div className="text-zinc-400">Next due</div>
                <div className="mt-0.5 font-mono text-zinc-700 dark:text-zinc-300">
                  {fmtDate(item.nextDueAt)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
