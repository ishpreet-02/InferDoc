import type { PdfPage } from "./pdf";

/** What kind of resource a chunk came from (drives how a citation renders). */
export type ChunkKind = "PDF" | "DOC" | "IMAGE" | "VIDEO";

export type ChunkMetadata = {
  resourceId: string;
  resourceTitle: string;
  kind: ChunkKind;
  /** PDF/DOC page (1-based) when known. */
  page?: number;
  /** Video segment start/end in whole seconds. */
  startSec?: number;
  endSec?: number;
  /** Cloudinary URL for IMAGE/VIDEO chunks (so citations can link/thumbnail). */
  url?: string;
};

export type Chunk = {
  id: string;
  text: string;
  metadata: ChunkMetadata;
};

// ~500 tokens ≈ ~2000 chars (rough 4 chars/token). Chunk a bit under that and
// keep a small overlap so sentences spanning a boundary stay retrievable.
const CHUNK_CHARS = 1800;
const OVERLAP_CHARS = 200;

/** Split text into ~500-token chunks on whitespace boundaries. */
function splitText(text: string): string[] {
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

type ResourceRef = { id: string; title: string };

/**
 * Turn extracted PDF pages into Moss documents, each carrying its page number
 * and the owning resource's id/title as metadata (used for citations later).
 */
export function chunkPages(pages: PdfPage[], resource: ResourceRef): Chunk[] {
  const chunks: Chunk[] = [];
  for (const { page, text } of pages) {
    splitText(text).forEach((part, i) => {
      chunks.push({
        id: `${resource.id}:p${page}:c${i}`,
        text: part,
        metadata: {
          resourceId: resource.id,
          resourceTitle: resource.title,
          kind: "PDF",
          page,
        },
      });
    });
  }
  return chunks;
}

/** Chunk a pageless document (e.g. DOCX) into plain-text chunks. */
export function chunkPlainText(
  text: string,
  resource: ResourceRef,
  kind: ChunkKind = "DOC",
): Chunk[] {
  return splitText(text).map((part, i) => ({
    id: `${resource.id}:c${i}`,
    text: part,
    metadata: {
      resourceId: resource.id,
      resourceTitle: resource.title,
      kind,
    },
  }));
}

/**
 * One chunk holding an image's vision description, so a company-uploaded
 * diagram / error-code chart becomes searchable and citeable as the image.
 */
export function chunkImageDescription(
  description: string,
  resource: ResourceRef,
  url: string,
): Chunk[] {
  const text = description.trim();
  if (!text) return [];
  return [
    {
      id: `${resource.id}:img`,
      text,
      metadata: {
        resourceId: resource.id,
        resourceTitle: resource.title,
        kind: "IMAGE",
        url,
      },
    },
  ];
}

export type TranscriptSegment = { start: number; end: number; text: string };

const SEGMENT_WINDOW_SEC = 30;

/**
 * Merge Whisper segments into ~30s / ~1800-char windows, each carrying the
 * window's start/end seconds so a citation can deep-link the video and the
 * model can say "watch from M:SS to M:SS".
 */
export function chunkTranscript(
  segments: TranscriptSegment[],
  resource: ResourceRef,
  url: string,
): Chunk[] {
  const chunks: Chunk[] = [];
  let buf: TranscriptSegment[] = [];
  let chars = 0;

  const flush = () => {
    if (buf.length === 0) return;
    const start = Math.floor(buf[0].start);
    const end = Math.ceil(buf[buf.length - 1].end);
    const text = buf.map((s) => s.text.trim()).join(" ").replace(/\s+/g, " ").trim();
    if (text) {
      chunks.push({
        id: `${resource.id}:t${start}`,
        text,
        metadata: {
          resourceId: resource.id,
          resourceTitle: resource.title,
          kind: "VIDEO",
          startSec: start,
          endSec: end,
          url,
        },
      });
    }
    buf = [];
    chars = 0;
  };

  for (const seg of segments) {
    if (!seg || typeof seg.text !== "string") continue;
    const spanStart = buf.length ? buf[0].start : seg.start;
    const wouldExceed =
      chars + seg.text.length > CHUNK_CHARS || seg.end - spanStart > SEGMENT_WINDOW_SEC;
    if (buf.length && wouldExceed) flush();
    buf.push(seg);
    chars += seg.text.length;
  }
  flush();
  return chunks;
}

/** Format seconds as M:SS for human-readable video locators. */
export function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** A short human label for where a chunk/citation came from. */
export function locatorFor(meta: {
  kind?: string;
  // Accept string values too — the Moss sidecar stringifies all metadata.
  page?: number | string | null;
  startSec?: number | string | null;
  endSec?: number | string | null;
}): string | null {
  if (meta.kind === "VIDEO" && meta.startSec != null) {
    const end = meta.endSec != null ? `–${fmtTime(Number(meta.endSec))}` : "";
    return `${fmtTime(Number(meta.startSec))}${end}`;
  }
  if (meta.kind === "IMAGE") {
    return meta.page != null ? `figure p.${meta.page}` : "image";
  }
  if (meta.page != null) return `p.${meta.page}`;
  return null;
}
