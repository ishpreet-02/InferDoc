import { extractPdfPages, pagesToText } from "./pdf";
import {
  chunkPages,
  chunkPlainText,
  chunkImageDescription,
  chunkTranscript,
  type Chunk,
} from "./chunk";
import { indexChunks } from "./moss";
import { uploadImageToCloudinary } from "./cloudinary";
import { describeImage } from "./agent/llm";
import { transcribe } from "./transcribe";
import mammoth from "mammoth";

/** Pages with fewer than this many non-space chars are treated as image/scan pages. */
const PDF_MIN_TEXT = 80;
/** Cap vision calls per PDF (a scanned manual could be all image pages). */
const PDF_MAX_IMAGE_PAGES = 8;

type VisionContext = { product: string; category: string };

/** Cloudinary page→image URL for an image-type PDF upload. */
function rasterPageUrl(baseUrl: string, page: number): string {
  return baseUrl
    .replace("/image/upload/", `/image/upload/pg_${page},w_1024/`)
    .replace(/\.pdf$/i, ".png");
}

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
  context?: VisionContext,
): Promise<IngestResult> {
  const pages = await extractPdfPages(bytes);
  const chunks = chunkPages(pages, resource);
  const text = pagesToText(pages);

  // Image parsing: pages with little/no extractable text are likely figures,
  // diagrams or scans. Rasterize each via Cloudinary and vision-describe it so
  // its content is searchable + citeable (as the page image). Best-effort.
  if (context) {
    const imagePages = pages
      .filter((p) => p.text.replace(/\s/g, "").length < PDF_MIN_TEXT)
      .slice(0, PDF_MAX_IMAGE_PAGES);
    if (imagePages.length > 0) {
      try {
        // A second, image-type upload of the same PDF enables page rasterization
        // (the download copy stays a raw upload).
        const { url: rasterBase } = await uploadImageToCloudinary(
          bytes,
          `${resource.id}-raster`,
        );
        for (const p of imagePages) {
          const pageUrl = rasterPageUrl(rasterBase, p.page);
          try {
            const desc = (await describeImage(pageUrl, context)).trim();
            if (desc && !/nothing diagnostic/i.test(desc)) {
              chunks.push({
                id: `${resource.id}:imgp${p.page}`,
                text: `Manual page ${p.page} (figure): ${desc}`,
                metadata: {
                  resourceId: resource.id,
                  resourceTitle: resource.title,
                  kind: "IMAGE",
                  page: p.page,
                  url: pageUrl,
                },
              });
            }
          } catch (err) {
            console.error(`[ingestPdf:imagepage ${p.page}]`, err);
          }
        }
      } catch (err) {
        console.error("[ingestPdf:raster-upload]", err);
      }
    }
  }

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
