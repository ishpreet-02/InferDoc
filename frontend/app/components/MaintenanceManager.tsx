"use client";

import { useState } from "react";

type ProductOption = { id: string; name: string };
type Task = {
  id: string;
  title: string;
  intervalDays: number;
  sourceExcerpt: string | null;
};
type Suggestion = { title: string; intervalDays: number; sourceExcerpt: string };

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

export function MaintenanceManager({ products }: { products: ProductOption[] }) {
  const [productId, setProductId] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [listStatus, setListStatus] = useState<Status>({ kind: "idle" });
  const [addStatus, setAddStatus] = useState<Status>({ kind: "idle" });
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // AI "suggest from manual" flow.
  const [suggestStatus, setSuggestStatus] = useState<Status>({ kind: "idle" });
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [chosen, setChosen] = useState<boolean[]>([]);
  const [addingSelected, setAddingSelected] = useState(false);

  async function loadTasks(id: string) {
    if (!id) {
      setTasks([]);
      return;
    }
    setListStatus({ kind: "loading" });
    try {
      const res = await fetch(`/api/products/${id}/tasks`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "request failed");
      setTasks(json.tasks);
      setListStatus({ kind: "idle" });
    } catch (err) {
      setTasks([]);
      setListStatus({ kind: "error", message: String(err) });
    }
  }

  function selectProduct(id: string) {
    setProductId(id);
    setAddStatus({ kind: "idle" });
    setSuggestStatus({ kind: "idle" });
    setSuggestions(null);
    loadTasks(id);
  }

  async function suggestFromManual() {
    setSuggestStatus({ kind: "loading" });
    setSuggestions(null);
    try {
      const res = await fetch(`/api/products/${productId}/tasks/suggest`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "request failed");
      const list: Suggestion[] = json.suggestions ?? [];
      setSuggestions(list);
      setChosen(list.map(() => true));
      setSuggestStatus(
        list.length === 0
          ? { kind: "error", message: "No maintenance schedule found in the manual." }
          : { kind: "idle" },
      );
    } catch (err) {
      setSuggestStatus({ kind: "error", message: String(err) });
    }
  }

  async function addSelected() {
    if (!suggestions) return;
    const picked = suggestions.filter((_, i) => chosen[i]);
    if (picked.length === 0) return;
    setAddingSelected(true);
    setSuggestStatus({ kind: "loading" });
    try {
      for (const s of picked) {
        const res = await fetch(`/api/products/${productId}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: s.title,
            intervalDays: s.intervalDays,
            sourceExcerpt: s.sourceExcerpt || undefined,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) throw new Error(json.error ?? "request failed");
      }
      setSuggestions(null);
      setSuggestStatus({ kind: "ok", message: `Added ${picked.length} task(s) from the manual.` });
      loadTasks(productId);
    } catch (err) {
      setSuggestStatus({ kind: "error", message: String(err) });
    } finally {
      setAddingSelected(false);
    }
  }

  async function addTask(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setAddStatus({ kind: "loading" });
    try {
      const res = await fetch(`/api/products/${productId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: data.get("title"),
          intervalDays: Number(data.get("intervalDays")),
          sourceExcerpt: data.get("sourceExcerpt") || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "request failed");
      const owners =
        json.ownersBackfilled > 0
          ? ` Added to ${json.ownersBackfilled} owner's service log.`
          : "";
      setAddStatus({ kind: "ok", message: `Added “${json.task.title}”.${owners}` });
      form.reset();
      loadTasks(productId);
    } catch (err) {
      setAddStatus({ kind: "error", message: String(err) });
    }
  }

  async function deleteTask(taskId: string, title: string) {
    if (!window.confirm(`Delete maintenance task “${title}”?`)) return;
    setDeletingId(taskId);
    try {
      const res = await fetch(`/api/products/${productId}/tasks/${taskId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "request failed");
      loadTasks(productId);
    } catch (err) {
      setAddStatus({ kind: "error", message: String(err) });
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold">Maintenance tasks</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Define the upkeep schedule for a product. Tasks appear in owners’ “My
        Products” service log.
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
              {/* Existing tasks */}
              <div>
                <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Existing tasks
                </h3>
                {listStatus.kind === "loading" ? (
                  <p className="mt-2 text-sm text-zinc-500">Loading…</p>
                ) : tasks.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500">No tasks yet.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
                    {tasks.map((t) => (
                      <li
                        key={t.id}
                        className="flex items-center justify-between gap-4 py-2"
                      >
                        <span className="text-sm">
                          {t.title}
                          <span className="text-zinc-500">
                            {" "}
                            · every {t.intervalDays}d
                          </span>
                          {t.sourceExcerpt && (
                            <span className="block text-xs text-zinc-400">
                              {t.sourceExcerpt}
                            </span>
                          )}
                        </span>
                        <button
                          type="button"
                          onClick={() => deleteTask(t.id, t.title)}
                          disabled={deletingId === t.id}
                          className="shrink-0 rounded-lg border border-red-300 px-3 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950"
                        >
                          {deletingId === t.id ? "…" : "Delete"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <StatusBanner status={listStatus} />
              </div>

              {/* Suggest from manual (AI) */}
              <div className="border-t border-zinc-200 pt-5 dark:border-zinc-800">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Suggest from manual
                    </h3>
                    <p className="text-xs text-zinc-500">
                      Let the assistant read this product’s manual and propose a
                      schedule.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={suggestFromManual}
                    disabled={suggestStatus.kind === "loading"}
                    className="shrink-0 rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-50 disabled:opacity-60 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950"
                  >
                    {suggestStatus.kind === "loading"
                      ? "Reading manual…"
                      : "✨ Suggest"}
                  </button>
                </div>

                {suggestions && suggestions.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {suggestions.map((s, i) => (
                      <label
                        key={i}
                        className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
                      >
                        <input
                          type="checkbox"
                          checked={chosen[i] ?? false}
                          onChange={(e) =>
                            setChosen((prev) => {
                              const next = [...prev];
                              next[i] = e.target.checked;
                              return next;
                            })
                          }
                          className="mt-0.5"
                        />
                        <span>
                          {s.title}
                          <span className="text-zinc-500"> · every {s.intervalDays}d</span>
                          {s.sourceExcerpt && (
                            <span className="block text-xs text-zinc-400">
                              {s.sourceExcerpt}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                    <button
                      type="button"
                      onClick={addSelected}
                      disabled={addingSelected || chosen.every((c) => !c)}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
                    >
                      {addingSelected
                        ? "Adding…"
                        : `Add ${chosen.filter(Boolean).length} selected`}
                    </button>
                  </div>
                )}
                <StatusBanner status={suggestStatus} />
              </div>

              {/* Add task */}
              <form onSubmit={addTask} className="space-y-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
                <div>
                  <label className={labelCls}>Task title *</label>
                  <input name="title" required className={inputCls} placeholder="Clean filter" />
                </div>
                <div>
                  <label className={labelCls}>Interval (days) *</label>
                  <input
                    name="intervalDays"
                    type="number"
                    min={1}
                    step={1}
                    required
                    className={inputCls}
                    placeholder="90"
                  />
                </div>
                <div>
                  <label className={labelCls}>Note / source</label>
                  <input
                    name="sourceExcerpt"
                    className={inputCls}
                    placeholder="Every 3 months — see manual p.4 (optional)"
                  />
                </div>
                <button
                  type="submit"
                  disabled={addStatus.kind === "loading"}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-500 disabled:opacity-60"
                >
                  {addStatus.kind === "loading" ? "Adding…" : "Add task"}
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
