import Link from "next/link";
import { getDemoUser } from "@/app/lib/user";
import { getOverdueCount } from "@/app/lib/maintenance";
import { getAlertCount } from "@/app/lib/warranty";

const LINK_CLASS =
  "relative shrink-0 rounded-md px-2.5 py-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 sm:px-3";

/**
 * Async server component for the "My Products" nav entry. Shows a live count of
 * overdue maintenance items. Rendered inside a <Suspense> boundary in the layout
 * so its count query streams in and never blocks the page's initial render.
 */
export async function MyProductsNav() {
  let attention = 0;
  try {
    const user = await getDemoUser();
    // Combined "needs attention" count: overdue maintenance + warranty/recall alerts.
    const [overdue, alerts] = await Promise.all([
      getOverdueCount(user.id),
      getAlertCount(user.id),
    ]);
    attention = overdue + alerts;
  } catch {
    // No seeded user yet — render the link without a badge.
  }

  return (
    <Link href="/my-products" className={LINK_CLASS}>
      My Products
      {attention > 0 && (
        <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold tabular-nums text-white">
          {attention}
        </span>
      )}
    </Link>
  );
}

/** Instant fallback (no badge) shown while the count query resolves. */
export function MyProductsNavFallback() {
  return (
    <Link href="/my-products" className={LINK_CLASS}>
      My Products
    </Link>
  );
}
