import { prisma } from "./prisma";

/**
 * Maintenance domain helpers shared by the /my-products pages and the
 * inventory / maintenance API routes.
 *
 * The DB stores a coarse `status` (PENDING/DONE/OVERDUE) plus `nextDueAt`. The
 * UI wants a finer, *computed* view — OVERDUE / DUE_SOON / OK — derived purely
 * from `nextDueAt` relative to now, so badges stay correct without a cron job.
 */

/** Anything due within this many days (but not yet overdue) counts as DUE_SOON. */
export const DUE_SOON_DAYS = 14;

const DAY_MS = 86_400_000;

export type DisplayStatus = "OVERDUE" | "DUE_SOON" | "OK";

export type MaintenanceView = {
  statusId: string;
  taskId: string;
  title: string;
  intervalDays: number;
  sourceExcerpt: string | null;
  lastDoneAt: Date | null;
  nextDueAt: Date | null;
  display: DisplayStatus;
  /** Whole days until due (negative when overdue); null if no due date. */
  daysUntilDue: number | null;
  /** 0..1 fraction of the interval elapsed since lastDoneAt (clamped). */
  progress: number;
};

/** Derive the display status from a due date relative to `now`. */
export function computeDisplayStatus(
  nextDueAt: Date | null,
  now: Date = new Date(),
): DisplayStatus {
  if (!nextDueAt) return "OK";
  const diffDays = (nextDueAt.getTime() - now.getTime()) / DAY_MS;
  if (diffDays < 0) return "OVERDUE";
  if (diffDays <= DUE_SOON_DAYS) return "DUE_SOON";
  return "OK";
}

function daysUntil(nextDueAt: Date | null, now: Date): number | null {
  if (!nextDueAt) return null;
  return Math.ceil((nextDueAt.getTime() - now.getTime()) / DAY_MS);
}

/** Fraction of the interval that has elapsed since the task was last done. */
function elapsedProgress(
  lastDoneAt: Date | null,
  nextDueAt: Date | null,
  intervalDays: number,
  now: Date,
): number {
  if (!nextDueAt) return 0;
  const span = intervalDays * DAY_MS;
  if (span <= 0) return 1;
  const elapsed = now.getTime() - (nextDueAt.getTime() - span);
  return Math.max(0, Math.min(1, elapsed / span));
}

/** A MaintenanceTask with the current user's status pre-filtered into `status`. */
type TaskWithStatus = {
  id: string;
  title: string;
  intervalDays: number;
  sourceExcerpt: string | null;
  status: {
    id: string;
    lastDoneAt: Date | null;
    nextDueAt: Date | null;
  }[];
};

const STATUS_RANK: Record<DisplayStatus, number> = { OVERDUE: 0, DUE_SOON: 1, OK: 2 };

/** Shape a task+status row into a MaintenanceView. Pure — no DB. */
export function toMaintenanceView(t: TaskWithStatus, now: Date = new Date()): MaintenanceView {
  const s = t.status[0];
  const nextDueAt = s?.nextDueAt ?? null;
  return {
    statusId: s?.id ?? "",
    taskId: t.id,
    title: t.title,
    intervalDays: t.intervalDays,
    sourceExcerpt: t.sourceExcerpt,
    lastDoneAt: s?.lastDoneAt ?? null,
    nextDueAt,
    display: computeDisplayStatus(nextDueAt, now),
    daysUntilDue: daysUntil(nextDueAt, now),
    progress: elapsedProgress(s?.lastDoneAt ?? null, nextDueAt, t.intervalDays, now),
  };
}

/** Sort views most-urgent first (OVERDUE → DUE_SOON → OK, then by due date). */
export function sortMaintenanceViews(views: MaintenanceView[]): MaintenanceView[] {
  return views.sort((a, b) => {
    if (STATUS_RANK[a.display] !== STATUS_RANK[b.display]) {
      return STATUS_RANK[a.display] - STATUS_RANK[b.display];
    }
    const at = a.nextDueAt?.getTime() ?? Infinity;
    const bt = b.nextDueAt?.getTime() ?? Infinity;
    return at - bt;
  });
}

/**
 * Load every maintenance task for a product the demo user owns, joined with the
 * user's per-task status, shaped for the maintenance UI and sorted most-urgent
 * first (OVERDUE → DUE_SOON → OK, then by due date).
 */
export async function getMaintenanceForProduct(
  userId: string,
  productId: string,
  now: Date = new Date(),
): Promise<MaintenanceView[]> {
  const tasks = await prisma.maintenanceTask.findMany({
    where: { productId },
    orderBy: { intervalDays: "asc" },
    include: { status: { where: { userId } } },
  });
  return sortMaintenanceViews(tasks.map((t) => toMaintenanceView(t, now)));
}

/**
 * Count the demo user's overdue maintenance items across all owned products.
 * Drives the nav badge. Computed from `nextDueAt` so it never goes stale.
 */
export async function getOverdueCount(
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  return prisma.userMaintenanceStatus.count({
    where: { userId, nextDueAt: { lt: now } },
  });
}
