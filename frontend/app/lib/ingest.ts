import { extractPdfPages, pagesToText } from "./pdf";
import { chunkPages } from "./chunk";
import { indexChunks } from "./moss";

export type IngestResult = {
  pages: number;
  chunks: number;
  indexed: number;
  text: string;
};

/**
 * Full ingest pipeline for one PDF resource:
 * extract per-page text → chunk (with page metadata) → index into Moss.
 *
 * Returns the concatenated text so the caller can persist Resource.extractedText.
 */
export async function ingestPdf(
  productId: string,
  resource: { id: string; title: string },
  bytes: Uint8Array,
): Promise<IngestResult> {
  const pages = await extractPdfPages(bytes);
  const chunks = chunkPages(pages, resource);
  const text = pagesToText(pages);

  let indexed = 0;
  if (chunks.length > 0) {
    const r = await indexChunks(productId, chunks);
    indexed = r.indexed;
  }

  return { pages: pages.length, chunks: chunks.length, indexed, text };
}
