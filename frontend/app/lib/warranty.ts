import { prisma } from "./prisma";

/**
 * Warranty & recall domain helpers shared by the /my-products pages and the
 * product / recall API routes.
 *
 * Warranty status is *computed* from the owner's purchase date plus the
 * product's `warrantyMonths` (relative to now), so it never goes stale — the
 * same pattern as maintenance (see ./maintenance). Recalls are simple rows the
 * company posts per product; every owner of that product sees them.
 */

const DAY_MS = 86_400_000;
/** Warranty within this many days of expiry is flagged "EXPIRING". */
export const WARRANTY_EXPIRING_DAYS = 30;

export type WarrantyStatus = "ACTIVE" | "EXPIRING" | "EXPIRED" | "UNKNOWN";

export type WarrantyView = {
  status: WarrantyStatus;
  warrantyMonths: number | null;
  expiresAt: Date | null;
  /** Whole days until expiry (negative when expired); null if unknown. */
  daysLeft: number | null;
};

/** Add N months to a date, clamping the day to the target month's length. */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  // Clamp (e.g. Jan 31 + 1 month → Feb 28/29, not Mar 3).
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  return d;
}

/** Pure: derive a warranty view from purchase date + warranty length. */
export function computeWarranty(
  purchasedAt: Date | null,
  warrantyMonths: number | null,
  now: Date = new Date(),
): WarrantyView {
  if (!warrantyMonths || warrantyMonths <= 0 || !purchasedAt) {
    return { status: "UNKNOWN", warrantyMonths: warrantyMonths ?? null, expiresAt: null, daysLeft: null };
  }
  const expiresAt = addMonths(purchasedAt, warrantyMonths);
  const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS);
  const status: WarrantyStatus =
    daysLeft < 0 ? "EXPIRED" : daysLeft <= WARRANTY_EXPIRING_DAYS ? "EXPIRING" : "ACTIVE";
  return { status, warrantyMonths, expiresAt, daysLeft };
}

export type RecallView = {
  id: string;
  title: string;
  body: string;
  severity: "NOTICE" | "SAFETY" | "RECALL";
  url: string | null;
  issuedAt: Date;
};

/** All recalls/notices for a product, newest first. */
export async function getRecallsForProduct(productId: string): Promise<RecallView[]> {
  const rows = await prisma.recall.findMany({
    where: { productId },
    orderBy: { issuedAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    severity: r.severity,
    url: r.url,
    issuedAt: r.issuedAt,
  }));
}

/**
 * Count "alerts" the demo user should see across owned products: open recalls
 * plus warranties that are expiring or expired. Drives the nav badge.
 */
export async function getAlertCount(
  userId: string,
  now: Date = new Date(),
): Promise<number> {
  const inventory = await prisma.userInventory.findMany({
    where: { userId },
    select: {
      purchasedAt: true,
      product: {
        select: { warrantyMonths: true, _count: { select: { recalls: true } } },
      },
    },
  });

  let count = 0;
  for (const inv of inventory) {
    count += inv.product._count.recalls;
    const w = computeWarranty(inv.purchasedAt, inv.product.warrantyMonths, now);
    if (w.status === "EXPIRING" || w.status === "EXPIRED") count += 1;
  }
  return count;
}
