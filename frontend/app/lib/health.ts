import { prisma } from "./prisma";
import type { Readout } from "./agent/diagnostic";

/**
 * Product Health Score — company-facing analytics derived from the diagnostic
 * conversations a product has accumulated. No new data capture: every assistant
 * turn already stores its structured `readout` (candidate causes + stage) in
 * `Message.citations`, so we mine that.
 *
 * The score blends two signals the support data exposes:
 *   - resolution rate  — how often the assistant reached a recommended fix
 *   - issue spread     — a single dominant recurring cause suggests a systemic
 *                        defect, which should drag the score down
 * Higher is healthier. With too little data we report `null` rather than a
 * misleadingly precise number.
 */

const DAY_MS = 86_400_000;
/** Below this many diagnosed conversations the score isn't meaningful. */
const MIN_SAMPLE = 3;

export type TopCause = { cause: string; count: number; share: number };

export type ProductHealth = {
  totalConversations: number;
  resolved: number;
  resolutionRate: number; // 0..1
  /** Conversations in the last 30 days vs the prior 30 (for a trend arrow). */
  recent: number;
  previous: number;
  topCauses: TopCause[];
  /** 0..100, or null when there isn't enough data. */
  score: number | null;
  sampleSize: number; // conversations that yielded at least one candidate cause
};

/** Pull the strongest candidate cause from an assistant message's readout. */
function dominantCause(citations: unknown): string | null {
  const readout = citations as Partial<Readout> | null;
  const causes = readout?.candidateCauses;
  if (!Array.isArray(causes) || causes.length === 0) return null;
  // candidateCauses are stored already sorted by confidence (see diagnostic.ts).
  const top = causes[0];
  const label = typeof top?.cause === "string" ? top.cause.trim() : "";
  return label || null;
}

export async function getProductHealth(
  productId: string,
  now: Date = new Date(),
): Promise<ProductHealth> {
  const conversations = await prisma.conversation.findMany({
    where: { productId },
    select: {
      status: true,
      createdAt: true,
      messages: {
        where: { role: "ASSISTANT" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { citations: true },
      },
    },
  });

  const total = conversations.length;
  const resolved = conversations.filter((c) => c.status === "RESOLVED").length;
  const resolutionRate = total > 0 ? resolved / total : 0;

  const cutoff = now.getTime() - 30 * DAY_MS;
  const prevCutoff = now.getTime() - 60 * DAY_MS;
  let recent = 0;
  let previous = 0;

  // Tally dominant causes (grouped case-insensitively, first spelling wins).
  const counts = new Map<string, { label: string; count: number }>();
  let sampleSize = 0;
  for (const c of conversations) {
    const t = c.createdAt.getTime();
    if (t >= cutoff) recent++;
    else if (t >= prevCutoff) previous++;

    const cause = dominantCause(c.messages[0]?.citations);
    if (!cause) continue;
    sampleSize++;
    const key = cause.toLowerCase();
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { label: cause, count: 1 });
  }

  const topCauses: TopCause[] = [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((e) => ({
      cause: e.label,
      count: e.count,
      share: sampleSize > 0 ? e.count / sampleSize : 0,
    }));

  // Concentration: share of the single most common cause (0 when no sample).
  const topShare = topCauses[0]?.share ?? 0;

  const score =
    total < MIN_SAMPLE
      ? null
      : Math.round(100 * (0.6 * resolutionRate + 0.4 * (1 - topShare)));

  return {
    totalConversations: total,
    resolved,
    resolutionRate,
    recent,
    previous,
    topCauses,
    score,
    sampleSize,
  };
}
