import { randomUUID } from "node:crypto";
import { prisma } from "@/app/lib/prisma";
import { ingestPdf } from "@/app/lib/ingest";
import { uploadPdfToCloudinary } from "@/app/lib/cloudinary";
import { apiError, friendlyMessage } from "@/app/lib/errors";

export const runtime = "nodejs";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

/**
 * POST /api/resources — add a resource to a product.
 *
 * Accepts multipart/form-data:
 *   productId  (required)
 *   title      (required)
 *   type       PDF | LINK   (default PDF if a file is present, else LINK)
 *   file       the PDF (when type=PDF)
 *   url        external URL (when type=LINK)
 *
 * For PDFs we upload the file to Cloudinary (so it survives a serverless /
 * read-only-filesystem deploy), extract per-page text, chunk it with page
 * metadata, persist Resource.extractedText, and index the chunks into the
 * product's Moss index.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const productId = String(form.get("productId") ?? "");
    const title = String(form.get("title") ?? "").trim();
    const file = form.get("file");
    const url = String(form.get("url") ?? "").trim();
    const type =
      String(form.get("type") ?? "") || (file instanceof File ? "PDF" : "LINK");

    if (!productId || !title) {
      return Response.json(
        { ok: false, error: "productId and title are required" },
        { status: 400 },
      );
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      return Response.json(
        { ok: false, error: "product not found" },
        { status: 404 },
      );
    }

    // ---- LINK resource: just store the URL, nothing to index ----
    if (type === "LINK") {
      if (!url) {
        return Response.json(
          { ok: false, error: "url is required for LINK resources" },
          { status: 400 },
        );
      }
      const resource = await prisma.resource.create({
        data: { productId, type: "LINK", url, title },
      });
      return Response.json({ ok: true, resource, indexed: 0 }, { status: 201 });
    }

    // ---- PDF resource: save → extract → chunk → index ----
    if (!(file instanceof File)) {
      return Response.json(
        { ok: false, error: "file is required for PDF resources" },
        { status: 400 },
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const publicId = `${slugify(title) || "manual"}-${randomUUID().slice(0, 8)}.pdf`;

    let publicUrl: string;
    try {
      const uploaded = await uploadPdfToCloudinary(bytes, publicId);
      publicUrl = uploaded.url;
    } catch (err) {
      console.error("[resources/upload]", err);
      return Response.json(
        { ok: false, error: `PDF upload failed: ${friendlyMessage(err)}` },
        { status: 502 },
      );
    }

    // Create the row first so chunk ids reference a stable resource id.
    const resource = await prisma.resource.create({
      data: { productId, type: "PDF", url: publicUrl, title },
    });

    let ingest;
    try {
      ingest = await ingestPdf(
        productId,
        { id: resource.id, title: resource.title },
        bytes,
      );
    } catch (err) {
      // Keep the uploaded resource even if indexing failed (e.g. Moss sidecar
      // down); log the detail, surface a friendly message to the dashboard.
      console.error("[resources/ingest]", err);
      return Response.json(
        {
          ok: false,
          resource,
          error: `The file was uploaded, but indexing failed: ${friendlyMessage(err)}`,
        },
        { status: 502 },
      );
    }

    await prisma.resource.update({
      where: { id: resource.id },
      data: { extractedText: ingest.text },
    });

    return Response.json(
      {
        ok: true,
        resource,
        pages: ingest.pages,
        chunks: ingest.chunks,
        indexed: ingest.indexed,
      },
      { status: 201 },
    );
  } catch (err) {
    return apiError("resources/create", err);
  }
}
