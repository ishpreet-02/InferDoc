import type { PdfPage } from "./pdf";

export type Chunk = {
  id: string;
  text: string;
  metadata: {
    resourceId: string;
    resourceTitle: string;
    page: number;
  };
};

// ~500 tokens ≈ ~2000 chars (rough 4 chars/token). Chunk a bit under that and
// keep a small overlap so sentences spanning a boundary stay retrievable.
const CHUNK_CHARS = 1800;
const OVERLAP_CHARS = 200;

/** Split a single page's text into ~500-token chunks on whitespace boundaries. */
function chunkPageText(text: string): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= CHUNK_CHARS) return clean ? [clean] : [];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_CHARS, clean.length);
    // Prefer to break at the last space before the hard limit.
    if (end < clean.length) {
      const lastSpace = clean.lastIndexOf(" ", end);
      if (lastSpace > start + CHUNK_CHARS / 2) end = lastSpace;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = end - OVERLAP_CHARS;
  }
  return chunks;
}

/**
 * Turn extracted PDF pages into Moss documents, each carrying its page number
 * and the owning resource's id/title as metadata (used for citations later).
 */
export function chunkPages(
  pages: PdfPage[],
  resource: { id: string; title: string },
): Chunk[] {
  const chunks: Chunk[] = [];
  for (const { page, text } of pages) {
    const parts = chunkPageText(text);
    parts.forEach((part, i) => {
      chunks.push({
        id: `${resource.id}:p${page}:c${i}`,
        text: part,
        metadata: {
          resourceId: resource.id,
          resourceTitle: resource.title,
          page,
        },
      });
    });
  }
  return chunks;
}
