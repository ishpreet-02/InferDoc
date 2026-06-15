"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ProductOption = { id: string; name: string; warrantyMonths: number | null };
type Recall = {
  id: string;
  title: string;
  body: string;
  severity: "NOTICE" | "SAFETY" | "RECALL";
  url: string | null;
  issuedAt: string;
};

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900";
const labelCls = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

const SEVERITY_LABEL: Record<Recall["severity"], string> = {
  NOTICE: "Notice",
  SAFETY: "Safety notice",
  RECALL: "Recall",
};
const SEVERITY_CLS: Record<Recall["severity"], string> = {
  NOTICE: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  SAFETY: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  RECALL: "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
};

function StatusBanner({ status }: { status: Status }) {
  if (status.kind === "idle" || status.kind === "loading") return null;
  const ok = status.kind === "ok";
  return (
    <p
      className={`mt-3 rounded-md px-3 py-2 text-sm ${
        ok
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
          : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
      }`}
    >
      {status.message}
    </p>
  );
}

export function WarrantyRecallManager({ products }: { products: ProductOption[] }) {
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [warranty, setWarranty] = useState("");
  const [warrantyStatus, setWarrantyStatus] = useState<Status>({ kind: "idle" });

  const [recalls, setRecalls] = useState<Recall[]>([]);
  const [listStatus, setListStatus] = useState<Status>({ kind: "idle" });
  const [addStatus, setAddStatus] = useState<Status>({ kind: "idle" });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadRecalls(id: string) {
    if (!id) {
      setRecalls([]);
      return;
    }
    setListStatus({ kind: "loading" });
    try {
      const res = await fetch(`/api/products/${id}/recalls`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "request failed");
      setRecalls(json.recalls);
      setListStatus({ kind: "idle" });
    } catch (err) {
      setRecalls([]);
      setListStatus({ kind: "error", message: String(err) });
    }
  }

  function selectProduct(id: string) {
    setProductId(id);
    setWarrantyStatus({ kind: "idle" });
    setAddStatus({ kind: "idle" });
    const p = products.find((x) => x.id === id);
    setWarranty(p?.warrantyMonths != null ? String(p.warrantyMonths) : "");
    loadRecalls(id);
  }

  async function saveWarranty(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setWarrantyStatus({ kind: "loading" });
    try {
      const res = await fetch(`/api/products/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          warrantyMonths: warranty.trim() === "" ? null : Number(warranty),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "request failed");
      setWarrantyStatus({
        kind: "ok",
        message:
          json.product.warrantyMonths != null
            ? `Warranty set to ${json.product.warrantyMonths} months.`
            : "Warranty cleared.",
      });
      router.refresh();
    } catch (err) {
      setWarrantyStatus({ kind: "error", message: String(err) });
    }
  }

  async function addRecall(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setAddStatus({ kind: "loading" });
    try {
      const res = await fetch(`/api/products/${productId}/recalls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.get("title"),
          body: data.get("body"),
          severity: data.get("severity"),
          url: data.get("url") || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "request failed");
      setAddStatus({ kind: "ok", message: `Published “${json.recall.title}”.` });
      form.reset();
      loadRecalls(productId);
      router.refresh();
    } catch (err) {
      setAddStatus({ kind: "error", message: String(err) });
    }
  }

  async function deleteRecall(recallId: string, title: string) {
    if (!window.confirm(`Retract “${title}”?`)) return;
    setDeletingId(recallId);
    try {
      const res = await fetch(`/api/products/${productId}/recalls/${recallId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "request failed");
      loadRecalls(productId);
      router.refresh();
    } catch (err) {
      setAddStatus({ kind: "error", message: String(err) });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold">Warranty &amp; recalls</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Set a product’s warranty length and publish recalls or safety notices.
        Owners see both in “My Products”.
      </p>

      {products.length === 0 ? (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Add a product first.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          <div>
            <label className={labelCls}>Product *</label>
            <select
              className={inputCls}
              value={productId}
              onChange={(e) => selectProduct(e.target.value)}
            >
              <option value="" disabled>
                Select a product…
              </option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {productId && (
            <>
              {/* Warranty */}
              <form
                onSubmit={saveWarranty}
                className="flex flex-wrap items-end gap-3 border-t border-zinc-200 pt-5 dark:border-zinc-800"
              >
                <div className="grow">
                  <label className={labelCls}>Warranty length (months)</label>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={warranty}
                    onChange={(e) => setWarranty(e.target.value)}
                    className={inputCls}
                    placeholder="e.g. 24 — leave blank for none"
                  />
                </div>
                <button
                  type="submit"
                  disabled={warrantyStatus.kind === "loading"}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
                >
                  {warrantyStatus.kind === "loading" ? "Saving…" : "Save warranty"}
                </button>
                <div className="w-full">
                  <StatusBanner status={warrantyStatus} />
                </div>
              </form>

              {/* Existing recalls */}
              <div className="border-t border-zinc-200 pt-5 dark:border-zinc-800">
                <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Published recalls &amp; notices
                </h3>
                {listStatus.kind === "loading" ? (
                  <p className="mt-2 text-sm text-zinc-500">Loading…</p>
                ) : recalls.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500">None yet.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
                    {recalls.map((r) => (
                      <li key={r.id} className="flex items-start justify-between gap-4 py-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${SEVERITY_CLS[r.severity]}`}
                            >
                              {SEVERITY_LABEL[r.severity]}
                            </span>
                            <span className="text-sm font-medium">{r.title}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-zinc-500">{r.body}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteRecall(r.id, r.title)}
                          disabled={deletingId === r.id}
                          className="shrink-0 rounded-lg border border-red-300 px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                        >
                          {deletingId === r.id ? "…" : "Retract"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <StatusBanner status={listStatus} />
              </div>

              {/* Add recall */}
              <form
                onSubmit={addRecall}
                className="space-y-4 border-t border-zinc-200 pt-5 dark:border-zinc-800"
              >
                <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Publish a recall / notice
                </h3>
                <div>
                  <label className={labelCls}>Severity *</label>
                  <select name="severity" className={inputCls} defaultValue="NOTICE">
                    <option value="NOTICE">Notice (informational)</option>
                    <option value="SAFETY">Safety notice</option>
                    <option value="RECALL">Recall (stop use / return)</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Title *</label>
                  <input name="title" required className={inputCls} placeholder="Battery pack overheating" />
                </div>
                <div>
                  <label className={labelCls}>Details *</label>
                  <textarea name="body" rows={2} required className={inputCls} placeholder="What owners need to know and do…" />
                </div>
                <div>
                  <label className={labelCls}>Link</label>
                  <input name="url" className={inputCls} placeholder="https://… full notice (optional)" />
                </div>
                <button
                  type="submit"
                  disabled={addStatus.kind === "loading"}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
                >
                  {addStatus.kind === "loading" ? "Publishing…" : "Publish"}
                </button>
                <StatusBanner status={addStatus} />
              </form>
            </>
          )}
        </div>
      )}
    </section>
  );
}
