import Link from "next/link";
import { prisma } from "@/app/lib/prisma";
import { getDemoUser } from "@/app/lib/user";
import {
  toMaintenanceView,
  sortMaintenanceViews,
  type MaintenanceView,
} from "@/app/lib/maintenance";
import { ProductImage } from "@/app/components/ProductImage";
import { StatusBadge } from "@/app/components/StatusBadge";

export const dynamic = "force-dynamic";

function tally(views: MaintenanceView[]) {
  return {
    overdue: views.filter((v) => v.display === "OVERDUE").length,
    dueSoon: views.filter((v) => v.display === "DUE_SOON").length,
    ok: views.filter((v) => v.display === "OK").length,
    total: views.length,
  };
}

export default async function MyProductsPage() {
  const user = await getDemoUser();

  // Inventory and the user's maintenance statuses are both keyed only by userId,
  // so fetch them concurrently (instead of inventory → then maintenance), then
  // group statuses by product in memory. Halves the wall-clock DB time.
  const now = new Date();
  const [inventory, statuses] = await Promise.all([
    prisma.userInventory.findMany({
      where: { userId: user.id },
      orderBy: { purchasedAt: "desc" },
      include: { product: true },
    }),
    prisma.userMaintenanceStatus.findMany({
      where: { userId: user.id },
      include: { task: true },
    }),
  ]);

  const byProduct = new Map<string, MaintenanceView[]>();
  for (const s of statuses) {
    const view = toMaintenanceView(
      {
        id: s.task.id,
        title: s.task.title,
        intervalDays: s.task.intervalDays,
        sourceExcerpt: s.task.sourceExcerpt,
        status: [{ id: s.id, lastDoneAt: s.lastDoneAt, nextDueAt: s.nextDueAt }],
      },
      now,
    );
    const list = byProduct.get(s.task.productId) ?? [];
    list.push(view);
    byProduct.set(s.task.productId, list);
  }

  const items = inventory.map((inv) => {
    const views = sortMaintenanceViews(byProduct.get(inv.productId) ?? []);
    return { inv, views, counts: tally(views) };
  });

  const totals = items.reduce(
    (acc, it) => ({
      overdue: acc.overdue + it.counts.overdue,
      dueSoon: acc.dueSoon + it.counts.dueSoon,
      products: acc.products + 1,
    }),
    { overdue: 0, dueSoon: 0, products: 0 },
  );

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-indigo-500 dark:text-indigo-400">
            Owner&apos;s Garage
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            My Products
          </h1>
          <p className="mt-1 text-zinc-500">
            Everything you own, and what each one needs next.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          + Add a product
        </Link>
      </div>

      {/* Stat strip */}
      <div className="mt-6 grid grid-cols-3 gap-3 sm:max-w-md">
        <Stat label="Owned" value={totals.products} tone="neutral" />
        <Stat label="Overdue" value={totals.overdue} tone="overdue" />
        <Stat label="Due soon" value={totals.dueSoon} tone="dueSoon" />
      </div>

      {/* Inventory */}
      {items.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
          <p className="text-lg font-medium">No products yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
            Browse the catalog and hit{" "}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              Add to My Products
            </span>{" "}
            to start tracking maintenance.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            Browse catalog
          </Link>
        </div>
      ) : (
        <ul className="mt-8 grid gap-4">
          {items.map(({ inv, views, counts }) => {
            const next = views[0];
            return (
              <li key={inv.id}>
                <Link
                  href={`/my-products/${inv.productId}/maintenance`}
                  className="group flex gap-5 rounded-2xl border border-zinc-200 bg-white p-4 transition-all hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-500/5 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700"
                >
                  <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
                    <ProductImage
                      name={inv.product.name}
                      category={inv.product.category}
                      imageUrl={inv.product.imageUrl}
                    />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-lg font-semibold tracking-tight">
                        {inv.product.name}
                      </h2>
                      {inv.nickname && (
                        <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-[11px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                          “{inv.nickname}”
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs uppercase tracking-wide text-zinc-400">
                      {inv.product.category}
                    </p>

                    {/* Health summary */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {counts.overdue > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:ring-rose-900">
                          {counts.overdue} overdue
                        </span>
                      )}
                      {counts.dueSoon > 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-900">
                          {counts.dueSoon} due soon
                        </span>
                      )}
                      {counts.overdue === 0 && counts.dueSoon === 0 && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-900">
                          All on track
                        </span>
                      )}
                      <span className="text-xs text-zinc-400">
                        {counts.total} task{counts.total === 1 ? "" : "s"} tracked
                      </span>
                    </div>

                    {next && (
                      <p className="mt-2.5 truncate text-sm text-zinc-500">
                        <span className="text-zinc-400">Next up:</span>{" "}
                        <span className="text-zinc-700 dark:text-zinc-300">
                          {next.title}
                        </span>
                        {next.daysUntilDue != null && (
                          <span className="text-zinc-400">
                            {" "}
                            ·{" "}
                            {next.daysUntilDue < 0
                              ? `${Math.abs(next.daysUntilDue)}d overdue`
                              : `due in ${next.daysUntilDue}d`}
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="hidden shrink-0 flex-col items-end justify-between sm:flex">
                    {next && <StatusBadge status={next.display} />}
                    <span className="font-mono text-xs text-zinc-400 transition-colors group-hover:text-indigo-500">
                      View log →
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "overdue" | "dueSoon";
}) {
  const toneClass =
    tone === "overdue" && value > 0
      ? "text-rose-600 dark:text-rose-400"
      : tone === "dueSoon" && value > 0
        ? "text-amber-600 dark:text-amber-400"
        : "text-zinc-900 dark:text-zinc-100";
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
      <div className={`text-2xl font-semibold tabular-nums ${toneClass}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </div>
    </div>
  );
}
