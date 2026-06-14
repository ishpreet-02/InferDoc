import { randomUUID } from "node:crypto";
import { prisma } from "@/app/lib/prisma";
import {
  ingestPdf,
  ingestDocx,
  ingestImage,
  ingestVideo,
  type IngestResult,
} from "@/app/lib/ingest";
import {
  uploadPdfToCloudinary,
  uploadRawToCloudinary,
  uploadImageToCloudinary,
  uploadVideoToCloudinary,
} from "@/app/lib/cloudinary";
import { apiError, friendlyMessage } from "@/app/lib/errors";

export const runtime = "nodejs";

type FileKind = "PDF" | "DOC" | "IMAGE" | "VIDEO";

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

/** Pick the resource kind from an explicit type or the file's mime/extension. */
function resolveKind(explicit: string, file: File | null): FileKind | "LINK" {
  const t = explicit.toUpperCase();
  if (t === "PDF" || t === "DOC" || t === "IMAGE" || t === "VIDEO" || t === "LINK") {
    return t as FileKind | "LINK";
  }
  if (!(file instanceof File)) return "LINK";
  const m = file.type;
  if (m === "application/pdf") return "PDF";
  if (m.startsWith("image/")) return "IMAGE";
  if (m.startsWith("video/")) return "VIDEO";
  if (m.includes("word") || /\.docx?$/i.test(file.name)) return "DOC";
  return "PDF";
}

const KIND_CONFIG: Record<
  FileKind,
  { ext: string; upload: (b: Uint8Array, id: string) => Promise<{ url: string }> }
> = {
  PDF: { ext: ".pdf", upload: uploadPdfToCloudinary },
  DOC: { ext: ".docx", upload: uploadRawToCloudinary },
  IMAGE: { ext: "", upload: uploadImageToCloudinary },
  VIDEO: { ext: "", upload: uploadVideoToCloudinary },
};

/**
 * POST /api/resources — add a resource to a product.
 *
 * multipart/form-data: productId, title, type (PDF|DOC|IMAGE|VIDEO|LINK; inferred
 * from the file mime when omitted), file (for the upload kinds) or url (for LINK).
 *
 * Files are uploaded to Cloudinary (so they survive a serverless deploy), then
 * ingested into the product's Moss index per kind:
 *   PDF/DOC → extracted text, page/section chunks
 *   IMAGE   → vision description (searchable + citeable as the image)
 *   VIDEO   → transcript split into time-ranged chunks ("watch from M:SS to M:SS")
 * The resource row is kept even if ingestion fails (e.g. sidecar down, no
 * transcription key).
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const productId = String(form.get("productId") ?? "");
    const title = String(form.get("title") ?? "").trim();
    const file = form.get("file");
    const url = String(form.get("url") ?? "").trim();
    const fileObj = file instanceof File ? file : null;
    const kind = resolveKind(String(form.get("type") ?? ""), fileObj);

    if (!productId || !title) {
      return Response.json(
        { ok: false, error: "productId and title are required" },
        { status: 400 },
      );
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return Response.json({ ok: false, error: "product not found" }, { status: 404 });
    }

    // ---- LINK resource: just store the URL, nothing to index ----
    if (kind === "LINK") {
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

    // ---- File resource: upload → create row → ingest → index ----
    if (!fileObj) {
      return Response.json(
        { ok: false, error: `file is required for ${kind} resources` },
        { status: 400 },
      );
    }

    const cfg = KIND_CONFIG[kind];
    const bytes = new Uint8Array(await fileObj.arrayBuffer());
    const publicId = `${slugify(title) || "resource"}-${randomUUID().slice(0, 8)}${cfg.ext}`;

    let publicUrl: string;
    try {
      const uploaded = await cfg.upload(bytes, publicId);
      publicUrl = uploaded.url;
    } catch (err) {
      console.error("[resources/upload]", err);
      return Response.json(
        { ok: false, error: `Upload failed: ${friendlyMessage(err)}` },
        { status: 502 },
      );
    }

    // Create the row first so chunk ids reference a stable resource id.
    const resource = await prisma.resource.create({
      data: { productId, type: kind, url: publicUrl, title },
    });
    const ref = { id: resource.id, title: resource.title };

    let ingest: IngestResult;
    try {
      switch (kind) {
        case "PDF":
          ingest = await ingestPdf(productId, ref, bytes);
          break;
        case "DOC":
          ingest = await ingestDocx(productId, ref, bytes);
          break;
        case "IMAGE":
          ingest = await ingestImage(productId, ref, publicUrl, {
            product: product.name,
            category: product.category,
          });
          break;
        case "VIDEO":
          ingest = await ingestVideo(
            productId,
            ref,
            bytes,
            publicUrl,
            fileObj.name || "video.mp4",
            fileObj.type || "video/mp4",
          );
          break;
        default:
          throw new Error(`unsupported kind: ${kind}`);
      }
    } catch (err) {
      // Keep the uploaded resource even if ingestion failed (sidecar down,
      // missing transcription key, oversized video, …).
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
        kind,
        units: ingest.units,
        chunks: ingest.chunks,
        indexed: ingest.indexed,
      },
      { status: 201 },
    );
  } catch (err) {
    return apiError("resources/create", err);
  }
}
