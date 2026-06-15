"use client";

import { useState } from "react";

type ProductOption = { id: string; name: string };

type TopCause = { cause: string; count: number; share: number };
type Health = {
  totalConversations: number;
  resolved: number;
  resolutionRate: number;
  recent: number;
  previous: number;
  topCauses: TopCause[];
  score: number | null;
  sampleSize: number;
};

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; health: Health }
  | { kind: "error"; message: string };

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-700 dark:bg-zinc-900";
const labelCls = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

function scoreTone(score: number): { ring: string; text: string; label: string } {
  if (score >= 80)
    return { ring: "text-emerald-500", text: "text-emerald-600 dark:text-emerald-400", label: "Healthy" };
  if (score >= 60)
    return { ring: "text-amber-500", text: "text-amber-600 dark:text-amber-400", label: "Watch" };
  return { ring: "text-rose-500", text: "text-rose-600 dark:text-rose-400", label: "At risk" };
}

function ScoreGauge({ score }: { score: number }) {
  const tone = scoreTone(score);
  const r = 34;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-zinc-200 dark:stroke-zinc-800" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          className={`${tone.ring} transition-[stroke-dasharray] duration-700`}
          stroke="currentColor"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-bold tabular-nums ${tone.text}`}>{score}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">
          {tone.label}
        </span>
      </div>
    </div>
  );
}

export function ProductHealthPanel({ products }: { products: ProductOption[] }) {
  const [productId, setProductId] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function load(id: string) {
    setProductId(id);
    if (!id) {
      setState({ kind: "idle" });
      return;
    }
    setState({ kind: "loading" });
    try {
      const res = await fetch(`/api/products/${id}/health`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "request failed");
      setState({ kind: "ready", health: json.health });
    } catch (err) {
      setState({ kind: "error", message: String(err) });
    }
  }

  const h = state.kind === "ready" ? state.health : null;
  const trend = h ? h.recent - h.previous : 0;

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="text-lg font-semibold">Product health score</h2>
      <p className="mt-1 text-sm text-zinc-500">
        Insights mined from this product’s diagnostic conversations — resolution
        rate, common reported issues, and support volume trend.
      </p>

      {products.length === 0 ? (
        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          Add a product first.
        </p>
      ) : (
        <div className="mt-4 space-y-5">
          <div>
            <label className={labelCls}>Product *</label>
            <select className={inputCls} value={productId} onChange={(e) => load(e.target.value)}>
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

          {state.kind === "loading" && (
            <p className="text-sm text-zinc-500">Crunching conversations…</p>
          )}
          {state.kind === "error" && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {state.message}
            </p>
          )}

          {h && (
            <div className="space-y-5">
              {h.totalConversations === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
                  No diagnostic conversations yet. The health score appears once
                  customers start using the assistant.
                </p>
              ) : (
                <>
                  {/* Score + headline metrics */}
                  <div className="flex flex-wrap items-center gap-6">
                    {h.score != null ? (
                      <ScoreGauge score={h.score} />
                    ) : (
                      <div className="grid h-24 w-24 shrink-0 place-items-center rounded-full border-4 border-dashed border-zinc-200 text-center text-[10px] font-medium uppercase text-zinc-400 dark:border-zinc-800">
                        Limited data
                      </div>
                    )}
                    <div className="grid grid-cols-3 gap-4">
                      <Metric label="Conversations" value={String(h.totalConversations)} />
                      <Metric
                        label="Resolution rate"
                        value={`${Math.round(h.resolutionRate * 100)}%`}
                      />
                      <Metric
                        label="Last 30 days"
                        value={String(h.recent)}
                        hint={
                          trend === 0
                            ? "flat"
                            : trend > 0
                              ? `▲ ${trend} vs prior`
                              : `▼ ${Math.abs(trend)} vs prior`
                        }
                        hintTone={trend > 0 ? "up" : trend < 0 ? "down" : "flat"}
                      />
                    </div>
                  </div>

                  {/* Top reported issues */}
                  {h.topCauses.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Most common reported issues
                      </h3>
                      <div className="space-y-2">
                        {h.topCauses.map((c, i) => {
                          const pct = Math.round(c.share * 100);
                          return (
                            <div key={`${c.cause}-${i}`}>
                              <div className="mb-1 flex items-baseline justify-between gap-3">
                                <span className="text-sm text-zinc-700 dark:text-zinc-200">
                                  {c.cause}
                                </span>
                                <span className="shrink-0 text-xs tabular-nums text-zinc-500">
                                  {c.count}× · {pct}%
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                                <div
                                  className={`h-full rounded-full ${
                                    i === 0 ? "bg-rose-500" : "bg-rose-300 dark:bg-rose-800"
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="mt-2 text-xs text-zinc-400">
                        Based on {h.sampleSize} diagnosed conversation
                        {h.sampleSize === 1 ? "" : "s"}.
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  hint,
  hintTone = "flat",
}: {
  label: string;
  value: string;
  hint?: string;
  hintTone?: "up" | "down" | "flat";
}) {
  const hintCls =
    hintTone === "up"
      ? "text-rose-500"
      : hintTone === "down"
        ? "text-emerald-500"
        : "text-zinc-400";
  return (
    <div>
      <div className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
        {label}
      </div>
      {hint && <div className={`text-[11px] ${hintCls}`}>{hint}</div>}
    </div>
  );
}
