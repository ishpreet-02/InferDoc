/**
 * Pure maintenance status helpers — NO prisma import, so this is safe to use
 * from both the server (app/lib/maintenance.ts) and client components
 * (my-products/.../MaintenanceList.tsx). Keeping the computation in one place
 * stops the server and client badges from drifting apart.
 */

export type DisplayStatus = "OVERDUE" | "DUE_SOON" | "OK";

const DAY_MS = 86_400_000;

/** Cap on the due-soon window for long-interval tasks. */
export const DUE_SOON_DAYS = 14;

/**
 * How many days before the due date a task starts showing DUE_SOON, scaled to
 * the task's cadence. A flat 14-day window made short-interval tasks (e.g. a
 * weekly task, due ≤7 days out) permanently DUE_SOON — they could never read
 * OK. We use a quarter of the interval, capped at DUE_SOON_DAYS and floored at
 * 1 day: weekly→2d, monthly→8d, quarterly→14d, yearly→14d.
 */
export function dueSoonWindowDays(intervalDays: number): number {
  return Math.max(1, Math.min(DUE_SOON_DAYS, Math.ceil(intervalDays * 0.25)));
}

/** Derive the display status from a due date relative to `now`. */
export function computeDisplayStatus(
  nextDueAt: Date | null,
  intervalDays: number,
  now: Date = new Date(),
): DisplayStatus {
  if (!nextDueAt) return "OK";
  const diffDays = (nextDueAt.getTime() - now.getTime()) / DAY_MS;
  if (diffDays < 0) return "OVERDUE";
  if (diffDays <= dueSoonWindowDays(intervalDays)) return "DUE_SOON";
  return "OK";
}
