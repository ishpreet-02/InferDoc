"use client";

import { useState } from "react";
import {
  computeDisplayStatus,
  type DisplayStatus,
} from "@/app/lib/maintenance-status";

const DAY_MS = 86_400_000;

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

// Uses the shared pure helper so marking complete updates the badge instantly
// (no server round-trip) and the client/server logic can't drift.
function computeDisplay(item: MaintenanceItem): DisplayStatus {
  return computeDisplayStatus(
    item.nextDueAt ? new Date(item.nextDueAt) : null,
    item.intervalDays,
  );
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

type Tone = "rose" | "amber" | "emerald";

const TONE: Record<
  Tone,
  { stroke: string; text: string; bar: string; ring: string }
> = {
  rose: {
    stroke: "#f43f5e",
    text: "text-rose-600 dark:text-rose-400",
    bar: "bg-rose-500",
    ring: "ring-rose-500/30",
  },
  amber: {
    stroke: "#f59e0b",
    text: "text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
    ring: "ring-amber-500/30",
  },
  emerald: {
    stroke: "#10b981",
    text: "text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
    ring: "ring-emerald-500/30",
  },
};

/** Per-task urgency copy for the progress row. */
function urgencyLabel(display: DisplayStatus, nextDueAt: string | null): string {
  const d = daysUntil(nextDueAt);
  if (d == null) return "Not scheduled";
  if (display === "OVERDUE") {
    const n = Math.abs(d);
    return `Overdue by ${n} day${n === 1 ? "" : "s"}`;
  }
  if (d === 0) return "Due today";
  return `Due in ${d} day${d === 1 ? "" : "s"}`;
}

/** SVG ring gauge for the product health score. */
function HealthRing({ score, tone }: { score: number; tone: Tone }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - score / 100);
  return (
    <div className="relative h-[88px] w-[88px] shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="7"
          className="stroke-zinc-200 dark:stroke-zinc-800"
        />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="7"
          strokeLinecap="round"
          stroke={TONE[tone].stroke}
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          key={score}
          className={`mnt-pop text-xl font-bold tabular-nums ${TONE[tone].text}`}
        >
          {score}
        </span>
        <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-400">
          health
        </span>
      </div>
    </div>
  );
}

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
    const da = computeDisplay(a);
    const db = computeDisplay(b);
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

  // ── Live health summary (drives urgency, recomputed on every change) ──
  const overdue = sorted.filter((i) => computeDisplay(i) === "OVERDUE").length;
  const dueSoon = sorted.filter((i) => computeDisplay(i) === "DUE_SOON").length;
  const ok = sorted.length - overdue - dueSoon;
  const score = Math.round(((ok + dueSoon * 0.5) / sorted.length) * 100);
  const tone: Tone =
    overdue > 0 || score < 50 ? "rose" : dueSoon > 0 || score < 85 ? "amber" : "emerald";

  const headline =
    overdue > 0
      ? "Action needed"
      : dueSoon > 0
        ? "Service coming up"
        : "All systems healthy";
  const sub =
    overdue > 0
      ? `${overdue} task${overdue === 1 ? "" : "s"} overdue${
          dueSoon ? ` · ${dueSoon} due soon` : ""
        } — clear them to restore full health.`
      : dueSoon > 0
        ? `${dueSoon} task${dueSoon === 1 ? "" : "s"} due soon. Get ahead of it.`
        : "Everything's on schedule. Nice work keeping it dialed in.";

  return (
    <div className="flex flex-col gap-4">
      {/* Health header */}
      <div
        className={`flex items-center gap-5 rounded-2xl border border-zinc-200 bg-white p-5 ring-1 ring-inset dark:border-zinc-800 dark:bg-zinc-900 ${TONE[tone].ring}`}
      >
        <HealthRing score={score} tone={tone} />
        <div className="min-w-0">
          <h2 className={`text-lg font-bold tracking-tight ${TONE[tone].text}`}>
            {headline}
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500">{sub}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px] font-semibold">
            {overdue > 0 && (
              <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                {overdue} overdue
              </span>
            )}
            {dueSoon > 0 && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                {dueSoon} due soon
              </span>
            )}
            {ok > 0 && (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                {ok} on track
              </span>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </div>
      )}

      {sorted.map((item) => {
        const display = computeDisplay(item);
        const isOverdue = display === "OVERDUE";
        const isDueSoon = display === "DUE_SOON";
        const cardTone: Tone = isOverdue ? "rose" : isDueSoon ? "amber" : "emerald";
        const progress = progressOf(item);
        const pct = Math.round(progress * 100);
        const isBusy = busy === item.statusId;
        const celebrate = justDone === item.statusId;

        return (
          <div
            key={item.statusId}
            className={`relative overflow-hidden rounded-2xl border bg-white p-5 transition-all dark:bg-zinc-900 ${
              celebrate
                ? "border-emerald-400 ring-2 ring-emerald-400/30 dark:border-emerald-600"
                : isOverdue
                  ? "mnt-glow border-rose-400/70 dark:border-rose-500/60"
                  : isDueSoon
                    ? "border-amber-300 dark:border-amber-500/40"
                    : "border-zinc-200 opacity-[0.92] dark:border-zinc-800"
            }`}
          >
            {/* Status accent rail */}
            <span
              className={`absolute inset-y-0 left-0 w-1 ${TONE[cardTone].bar} ${
                isOverdue ? "" : isDueSoon ? "opacity-80" : "opacity-40"
              }`}
            />

            <div className="flex items-start justify-between gap-4 pl-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="text-base font-semibold tracking-tight">
                    {item.title}
                  </h3>
                  {/* Urgency chip with live pulse for overdue */}
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                      isOverdue
                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-300"
                        : isDueSoon
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                          : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                    }`}
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      {isOverdue && (
                        <span className="mnt-ping absolute inline-flex h-full w-full rounded-full bg-rose-500" />
                      )}
                      <span
                        className={`relative inline-flex h-1.5 w-1.5 rounded-full ${TONE[cardTone].bar}`}
                      />
                    </span>
                    {isOverdue ? "Overdue" : isDueSoon ? "Due soon" : "On track"}
                  </span>
                  {celebrate && (
                    <span className="mnt-pop text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      ✓ logged · health restored
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
                className={`shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  isOverdue
                    ? "bg-rose-600 text-white hover:bg-rose-500"
                    : "bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                }`}
              >
                {isBusy ? "Saving…" : isOverdue ? "Service now" : "Mark complete"}
              </button>
            </div>

            {/* Interval progress toward next due date */}
            <div className="mt-4 pl-2">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span
                  className={`font-semibold ${
                    isOverdue || isDueSoon ? TONE[cardTone].text : "text-zinc-500"
                  }`}
                >
                  {isOverdue && "⚠ "}
                  {urgencyLabel(display, item.nextDueAt)}
                </span>
                <span className="font-mono text-zinc-400">
                  every {item.intervalDays}d
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className={`h-full rounded-full transition-[width] duration-700 ${TONE[cardTone].bar} ${
                    isOverdue ? "mnt-stripe" : ""
                  }`}
                  style={{ width: `${isOverdue ? 100 : Math.max(4, pct)}%` }}
                />
              </div>
            </div>

            {/* Service record */}
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-zinc-100 pt-3 pl-2 text-xs dark:border-zinc-800">
              <div>
                <div className="text-zinc-400">Last serviced</div>
                <div className="mt-0.5 font-mono text-zinc-700 dark:text-zinc-300">
                  {fmtDate(item.lastDoneAt)}
                </div>
              </div>
              <div>
                <div className="text-zinc-400">Next due</div>
                <div
                  className={`mt-0.5 font-mono ${
                    isOverdue
                      ? "font-semibold text-rose-600 dark:text-rose-400"
                      : "text-zinc-700 dark:text-zinc-300"
                  }`}
                >
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
