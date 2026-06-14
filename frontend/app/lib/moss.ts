import type { Chunk } from "./chunk";

// The Python FastAPI sidecar that hosts the inferedge-moss SDK.
const MOSS_SERVICE_URL =
  process.env.MOSS_SERVICE_URL ?? "http://localhost:8000";

export type MossDoc = {
  id: string;
  text: string;
  score: number | null;
  // The sidecar stringifies all metadata values, so numbers (page/startSec)
  // arrive as strings — callers coerce as needed.
  metadata: {
    resourceId?: string;
    resourceTitle?: string;
    kind?: string;
    page?: number | string;
    startSec?: number | string;
    endSec?: number | string;
    url?: string;
    [k: string]: unknown;
  };
};

/**
 * Upsert chunks for a product via the sidecar. They go into the shared
 * `acme-catalog` index, tagged with productId so queries can filter to one
 * product (the sidecar injects productId into each chunk's metadata).
 */
export async function indexChunks(
  productId: string,
  chunks: Chunk[],
): Promise<{ index: string; indexed: number }> {
  const res = await fetch(`${MOSS_SERVICE_URL}/index/${productId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ docs: chunks }),
    // never cache; this is a mutation
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Moss index failed (${res.status}): ${await res.text().catch(() => "")}`,
    );
  }
  return res.json();
}

/** Query the shared index, filtered server-side to this product's chunks. */
export async function queryMoss(
  productId: string,
  query: string,
  opts: { topK?: number; alpha?: number } = {},
): Promise<MossDoc[]> {
  const res = await fetch(`${MOSS_SERVICE_URL}/query/${productId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      top_k: opts.topK ?? 5,
      alpha: opts.alpha ?? 0.8,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Moss query failed (${res.status}): ${await res.text().catch(() => "")}`,
    );
  }
  const data = (await res.json()) as { docs: MossDoc[] };
  return data.docs;
}
