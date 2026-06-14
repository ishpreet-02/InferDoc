import type { RecallView, WarrantyView } from "@/app/lib/warranty";

/**
 * Owner-facing presentation of a product's warranty status and any recalls /
 * safety notices. Pure server components — fed by computeWarranty() and
 * getRecallsForProduct() (see app/lib/warranty.ts).
 */

const WARRANTY_TONE: Record<WarrantyView["status"], string> = {
  ACTIVE: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/40",
  EXPIRING: "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/40",
  EXPIRED: "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900",
  UNKNOWN: "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900",
};

function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function WarrantyCard({ warranty }: { warranty: WarrantyView }) {
  const { status, expiresAt, daysLeft } = warranty;

  const headline =
    status === "ACTIVE"
      ? "Warranty active"
      : status === "EXPIRING"
        ? "Warranty expiring soon"
        : status === "EXPIRED"
          ? "Warranty expired"
          : "No warranty on file";

  const detail =
    status === "UNKNOWN"
      ? "This product has no registered warranty period."
      : status === "EXPIRED"
        ? `Expired on ${expiresAt ? fmtDate(expiresAt) : "—"}.`
        : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left · expires ${expiresAt ? fmtDate(expiresAt) : "—"}.`;

  return (
    <div className={`rounded-xl border p-4 ${WARRANTY_TONE[status]}`}>
      <div className="flex items-center gap-2">
        <span className="text-base">🛡️</span>
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{headline}</p>
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">{detail}</p>
    </div>
  );
}

const SEVERITY: Record<RecallView["severity"], { label: string; cls: string; icon: string }> = {
  NOTICE: { label: "Notice", icon: "ℹ️", cls: "border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/50" },
  SAFETY: { label: "Safety notice", icon: "⚠️", cls: "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50" },
  RECALL: { label: "Recall", icon: "🚨", cls: "border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/50" },
};

export function RecallList({ recalls }: { recalls: RecallView[] }) {
  if (recalls.length === 0) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Recalls &amp; safety notices
      </h2>
      <ul className="space-y-3">
        {recalls.map((r) => {
          const s = SEVERITY[r.severity];
          return (
            <li key={r.id} className={`rounded-xl border p-4 ${s.cls}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base">{s.icon}</span>
                <span className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">
                  {s.label}
                </span>
                <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {r.title}
                </span>
                <span className="ml-auto text-xs text-zinc-400">{fmtDate(r.issuedAt)}</span>
              </div>
              <p className="mt-1.5 text-sm text-zinc-700 dark:text-zinc-300">{r.body}</p>
              {r.url && (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  Read the full notice ↗
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
