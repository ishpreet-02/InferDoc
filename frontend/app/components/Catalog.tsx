"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ProductImage } from "./ProductImage";

export type CatalogProduct = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  imageUrl: string | null;
  resourceCount: number;
};

export function Catalog({ products }: { products: CatalogProduct[] }) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        p.category.toLowerCase().includes(term),
    );
  }, [q, products]);

  // No products in the catalog at all (fresh DB before seeding).
  if (products.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 px-6 py-16 text-center dark:border-zinc-700">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-zinc-100 text-2xl dark:bg-zinc-800">
          📦
        </div>
        <p className="mt-4 text-lg font-medium">No products yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-zinc-500">
          Add your first product from the{" "}
          <Link
            href="/company/dashboard"
            className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
          >
            Company Dashboard
          </Link>
          , or run the seed script to load the demo catalog.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products by name or category…"
          className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-zinc-500">
          No products match “{q}”.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => (
            <Link
              key={p.id}
              href={`/products/${p.id}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="aspect-[16/10] overflow-hidden">
                <ProductImage
                  name={p.name}
                  category={p.category}
                  imageUrl={p.imageUrl}
                />
              </div>
              <div className="flex flex-1 flex-col p-4">
                <span className="mb-1 inline-flex w-fit rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                  {p.category}
                </span>
                <h3 className="font-semibold leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                  {p.name}
                </h3>
                {p.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-500">
                    {p.description}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between pt-1 text-xs text-zinc-400">
                  <span>
                    {p.resourceCount}{" "}
                    {p.resourceCount === 1 ? "resource" : "resources"}
                  </span>
                  <span className="font-medium text-indigo-600 dark:text-indigo-400">
                    View product →
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
