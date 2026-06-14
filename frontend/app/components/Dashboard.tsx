"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ProductOption = { id: string; name: string };

type Status =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; message: string }
  | { kind: "error"; message: string };

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900";
const labelCls = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

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

export function Dashboard({ products }: { products: ProductOption[] }) {
  const router = useRouter();

  // ---- add product ----
  const [pStatus, setPStatus] = useState<Status>({ kind: "idle" });
  async function addProduct(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setPStatus({ kind: "loading" });
    try {
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          category: data.get("category"),
          description: data.get("description"),
          imageUrl: data.get("imageUrl"),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "request failed");
      setPStatus({ kind: "ok", message: `Created “${json.product.name}”.` });
      form.reset();
      router.refresh();
    } catch (err) {
      setPStatus({ kind: "error", message: String(err) });
    }
  }

  // ---- upload resource ----
  const [rStatus, setRStatus] = useState<Status>({ kind: "idle" });
  const [resType, setResType] = useState<"PDF" | "LINK">("PDF");
  async function uploadResource(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form); // already multipart-ready (has the file)
    setRStatus({ kind: "loading" });
    try {
      const res = await fetch("/api/resources", { method: "POST", body: data });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "request failed");
      const detail =
        json.indexed != null
          ? ` Indexed ${json.indexed} chunk(s) across ${json.pages ?? "?"} page(s) into Moss.`
          : "";
      setRStatus({
        kind: "ok",
        message: `Added “${json.resource.title}”.${detail}`,
      });
      form.reset();
      setResType("PDF");
      router.refresh();
    } catch (err) {
      setRStatus({ kind: "error", message: String(err) });
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Add product */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Add a product</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Create a new product in the catalog.
        </p>
        <form onSubmit={addProduct} className="mt-4 space-y-4">
          <div>
            <label className={labelCls}>Name *</label>
            <input name="name" required className={inputCls} placeholder="Acme Blender B2" />
          </div>
          <div>
            <label className={labelCls}>Category *</label>
            <input name="category" required className={inputCls} placeholder="Blender" />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea name="description" rows={2} className={inputCls} placeholder="Short description…" />
          </div>
          <div>
            <label className={labelCls}>Image URL</label>
            <input name="imageUrl" className={inputCls} placeholder="https://… (optional)" />
          </div>
          <button
            type="submit"
            disabled={pStatus.kind === "loading"}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
          >
            {pStatus.kind === "loading" ? "Creating…" : "Create product"}
          </button>
          <StatusBanner status={pStatus} />
        </form>
      </section>

      {/* Upload resource */}
      <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-lg font-semibold">Upload a resource</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Attach a PDF manual (extracted, chunked &amp; indexed into Moss) or
          link an external resource.
        </p>

        {products.length === 0 ? (
          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            Add a product first.
          </p>
        ) : (
          <form onSubmit={uploadResource} className="mt-4 space-y-4">
            <div>
              <label className={labelCls}>Product *</label>
              <select name="productId" required className={inputCls} defaultValue="">
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
            <div>
              <label className={labelCls}>Title *</label>
              <input name="title" required className={inputCls} placeholder="Service Manual" />
            </div>
            <div>
              <label className={labelCls}>Type *</label>
              <select
                name="type"
                className={inputCls}
                value={resType}
                onChange={(e) => setResType(e.target.value as "PDF" | "LINK")}
              >
                <option value="PDF">PDF (upload &amp; index)</option>
                <option value="LINK">LINK (external URL)</option>
              </select>
            </div>
            {resType === "PDF" ? (
              <div>
                <label className={labelCls}>PDF file *</label>
                <input
                  name="file"
                  type="file"
                  accept="application/pdf"
                  required
                  className="block w-full text-sm text-zinc-500 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100 dark:file:bg-indigo-950 dark:file:text-indigo-300"
                />
              </div>
            ) : (
              <div>
                <label className={labelCls}>URL *</label>
                <input name="url" required className={inputCls} placeholder="https://…" />
              </div>
            )}
            <button
              type="submit"
              disabled={rStatus.kind === "loading"}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
            >
              {rStatus.kind === "loading"
                ? resType === "PDF"
                  ? "Uploading & indexing…"
                  : "Saving…"
                : "Add resource"}
            </button>
            <StatusBanner status={rStatus} />
          </form>
        )}
      </section>
    </div>
  );
}
