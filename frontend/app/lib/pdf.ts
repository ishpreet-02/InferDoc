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
  // pdfjs wants ownership of the TypedArray; pass a fresh Uint8Array.
  const bytes =
    data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);

  const parser = new PDFParse({ data: bytes });
  try {
    const result = await parser.getText();
    return result.pages
      .map((p) => ({ page: p.num, text: (p.text ?? "").trim() }))
      .filter((p) => p.text.length > 0);
  } finally {
    await parser.destroy();
  }
}

/** Convenience: full concatenated document text (for Resource.extractedText). */
export function pagesToText(pages: PdfPage[]): string {
  return pages.map((p) => p.text).join("\n\n");
}
