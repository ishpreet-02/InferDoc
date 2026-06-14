"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * "Add to My Products" — POSTs to /api/inventory, which creates the inventory
 * row and seeds maintenance statuses. Once owned, swaps to a link into the
 * product's maintenance log.
 */
export function AddToInventoryButton({
  productId,
  initiallyOwned,
}: {
  productId: string;
  initiallyOwned: boolean;
}) {
  const router = useRouter();
  const [owned, setOwned] = useState(initiallyOwned);
  const [loading, setLoading] = useState(false);
  const [seeded, setSeeded] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      setOwned(true);
      setSeeded(data.tasksTotal ?? null);
      router.refresh(); // refresh nav overdue badge + product page
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setLoading(false);
    }
  }

  if (owned) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/my-products/${productId}/maintenance`}
          className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-5 py-2.5 text-sm font-medium text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-950"
        >
          ✓ In My Products — view maintenance →
        </Link>
        {seeded != null && (
          <span className="text-xs text-zinc-500">
            {seeded} maintenance task{seeded === 1 ? "" : "s"} scheduled
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        onClick={add}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium text-zinc-800 shadow-sm transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
      >
        {loading ? "Adding…" : "＋ Add to My Products"}
      </button>
      {error && (
        <span className="text-xs text-rose-600 dark:text-rose-400">{error}</span>
      )}
    </div>
  );
}
