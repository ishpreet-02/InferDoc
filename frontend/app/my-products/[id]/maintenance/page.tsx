import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { getDemoUser } from "@/app/lib/user";
import { getMaintenanceForProduct } from "@/app/lib/maintenance";
import { ProductImage } from "@/app/components/ProductImage";
import { MaintenanceList, type MaintenanceItem } from "./MaintenanceList";

export const dynamic = "force-dynamic";

export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getDemoUser();

  // Ownership check + maintenance load run concurrently (independent given the
  // user id). The product must be in the user's inventory to have a service log.
  const [inventory, views] = await Promise.all([
    prisma.userInventory.findUnique({
      where: { userId_productId: { userId: user.id, productId: id } },
      include: { product: true },
    }),
    getMaintenanceForProduct(user.id, id),
  ]);
  if (!inventory) notFound();

  const items: MaintenanceItem[] = views.map((v) => ({
    statusId: v.statusId,
    taskId: v.taskId,
    title: v.title,
    intervalDays: v.intervalDays,
    sourceExcerpt: v.sourceExcerpt,
    lastDoneAt: v.lastDoneAt ? v.lastDoneAt.toISOString() : null,
    nextDueAt: v.nextDueAt ? v.nextDueAt.toISOString() : null,
  }));

  const overdue = views.filter((v) => v.display === "OVERDUE").length;
  const dueSoon = views.filter((v) => v.display === "DUE_SOON").length;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/my-products"
        className="mb-6 inline-block text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:hover:text-zinc-200"
      >
        ← My Products
      </Link>

      {/* Product header */}
      <div className="flex items-center gap-5">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <ProductImage
            name={inventory.product.name}
            category={inventory.product.category}
            imageUrl={inventory.product.imageUrl}
          />
        </div>
        <div className="min-w-0">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-indigo-500 dark:text-indigo-400">
            Maintenance Log
          </p>
          <h1 className="mt-0.5 truncate text-2xl font-semibold tracking-tight">
            {inventory.product.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {overdue > 0 ? (
              <span className="font-medium text-rose-600 dark:text-rose-400">
                {overdue} overdue
              </span>
            ) : dueSoon > 0 ? (
              <span className="font-medium text-amber-600 dark:text-amber-400">
                {dueSoon} due soon
              </span>
            ) : (
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                Everything on track
              </span>
            )}{" "}
            · {items.length} task{items.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="ml-auto hidden sm:block">
          <Link
            href={`/products/${id}/chat`}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            💬 Diagnose an issue
          </Link>
        </div>
      </div>

      <div className="mt-8">
        <MaintenanceList initial={items} />
      </div>
    </div>
  );
}
