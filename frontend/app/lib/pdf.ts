import { PDFParse } from "pdf-parse";

export type PdfPage = { page: number; text: string };

/**
 * Extract per-page text from a PDF.
 *
 * pdf-parse v2 returns native per-page text (`result.pages[].num/.text`), which
 * is exactly what we need to attach page-number metadata to each chunk.
 */
export async function extractPdfPages(
  data: Uint8Array | ArrayBuffer | Buffer,
): Promise<PdfPage[]> {
  // pdf.js takes ownership of the TypedArray and DETACHES its ArrayBuffer, so
  // always hand it a private copy — otherwise the caller's `bytes` is neutered
  // (length 0) after this call (e.g. ingestPdf reuses bytes to upload a raster
  // copy of the PDF).
  const view =
    data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
  const owned = new Uint8Array(view); // copy

  const parser = new PDFParse({ data: owned });
  try {
    const result = await parser.getText();
    // Keep ALL pages (including text-empty ones) so callers can spot image/scan
    // pages that text extraction missed and parse them visually. Text chunking
    // skips empty pages on its own.
    return result.pages.map((p) => ({ page: p.num, text: (p.text ?? "").trim() }));
  } finally {
    await parser.destroy();
  }
}

/** Convenience: full concatenated document text (for Resource.extractedText). */
export function pagesToText(pages: PdfPage[]): string {
  return pages.map((p) => p.text).filter(Boolean).join("\n\n");
}
