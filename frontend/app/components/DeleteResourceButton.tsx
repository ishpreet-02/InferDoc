"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteResourceButton({
  resourceId,
  title,
}: {
  resourceId: string;
  title: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    if (!window.confirm(`Delete resource “${title}”? This also removes it from the assistant's index.`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/resources/${resourceId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "request failed");
      router.refresh();
    } catch (err) {
      alert(`Could not delete: ${String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      title="Delete resource"
      className="shrink-0 rounded-md border border-red-300 px-2.5 py-1.5 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
    >
      {busy ? "…" : "Delete"}
    </button>
  );
}
