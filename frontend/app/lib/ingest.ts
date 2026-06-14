import { extractPdfPages, pagesToText } from "./pdf";
import {
  chunkPages,
  chunkPlainText,
  chunkImageDescription,
  chunkTranscript,
  type Chunk,
} from "./chunk";
import { indexChunks } from "./moss";
import { describeImage } from "./agent/llm";
import { transcribe } from "./transcribe";
import mammoth from "mammoth";

export type IngestResult = {
  /** Source units processed (pages for PDF, segments for video, etc.). */
  units: number;
  chunks: number;
  indexed: number;
  text: string;
};

type ResourceRef = { id: string; title: string };

async function index(productId: string, chunks: Chunk[]): Promise<number> {
  if (chunks.length === 0) return 0;
  const r = await indexChunks(productId, chunks);
  return r.indexed;
}

/**
 * PDF: extract per-page text → chunk (with page metadata) → index into Moss.
 * Returns the concatenated text so the caller can persist Resource.extractedText.
 */
export async function ingestPdf(
  productId: string,
  resource: ResourceRef,
  bytes: Uint8Array,
): Promise<IngestResult> {
  const pages = await extractPdfPages(bytes);
  const chunks = chunkPages(pages, resource);
  const text = pagesToText(pages);
  const indexed = await index(productId, chunks);
  return { units: pages.length, chunks: chunks.length, indexed, text };
}

/** DOCX: extract raw text (mammoth) → chunk (pageless) → index. */
export async function ingestDocx(
  productId: string,
  resource: ResourceRef,
  bytes: Uint8Array,
): Promise<IngestResult> {
  const { value } = await mammoth.extractRawText({
    buffer: Buffer.from(bytes),
  });
  const text = (value ?? "").trim();
  const chunks = chunkPlainText(text, resource, "DOC");
  const indexed = await index(productId, chunks);
  return { units: 1, chunks: chunks.length, indexed, text };
}

/**
 * IMAGE: describe the image with the vision model → index the description so the
 * company diagram / error-code chart is searchable and citeable as the image.
 */
export async function ingestImage(
  productId: string,
  resource: ResourceRef,
  imageUrl: string,
  context: { product: string; category: string },
): Promise<IngestResult> {
  const description = await describeImage(imageUrl, {
    product: context.product,
    category: context.category,
  });
  const chunks = chunkImageDescription(description, resource, imageUrl);
  const indexed = await index(productId, chunks);
  return { units: 1, chunks: chunks.length, indexed, text: description };
}

/**
 * VIDEO: transcribe (Whisper-compatible) → time-windowed chunks carrying
 * start/end seconds → index. extractedText is the full transcript.
 */
export async function ingestVideo(
  productId: string,
  resource: ResourceRef,
  bytes: Uint8Array,
  videoUrl: string,
  filename: string,
  mime: string,
): Promise<IngestResult> {
  const { text, segments } = await transcribe(bytes, filename, mime);
  const chunks = chunkTranscript(segments, resource, videoUrl);
  const indexed = await index(productId, chunks);
  return { units: segments.length, chunks: chunks.length, indexed, text };
}
