import { prisma } from "@/app/lib/prisma";
import { ingestPdf } from "@/app/lib/ingest";
import { apiError, friendlyMessage } from "@/app/lib/errors";

export const runtime = "nodejs";

/** Fetch a resource's PDF bytes from its (Cloudinary) URL. */
async function loadResourceBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetch ${url} failed with ${res.status}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

/**
 * POST /api/admin/reindex — (re)build Moss indexes from existing PDF resources.
 *
 * The seed creates Resource rows whose PDFs live on Cloudinary but does not index
 * them. This fetches each PDF, extracts/chunks it, refreshes
 * Resource.extractedText, and indexes the chunks. Useful to bootstrap retrieval
 * for the demo data (e.g. the scooter).
 *
 * Body (optional JSON): { "productId": "..." } to scope to one product.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const productId: string | undefined = body?.productId;

    const resources = await prisma.resource.findMany({
      where: { type: "PDF", ...(productId ? { productId } : {}) },
    });

    if (resources.length === 0) {
      return Response.json({ ok: true, message: "no PDF resources", results: [] });
    }

    const results = [];
    for (const resource of resources) {
      try {
        const bytes = await loadResourceBytes(resource.url);
        const ingest = await ingestPdf(
          resource.productId,
          { id: resource.id, title: resource.title },
          bytes,
        );
        await prisma.resource.update({
          where: { id: resource.id },
          data: { extractedText: ingest.text },
        });
        results.push({
          resourceId: resource.id,
          productId: resource.productId,
          url: resource.url,
          pages: ingest.pages,
          chunks: ingest.chunks,
          indexed: ingest.indexed,
        });
      } catch (err) {
        console.error("[admin/reindex:resource]", resource.id, err);
        results.push({
          resourceId: resource.id,
          productId: resource.productId,
          url: resource.url,
          error: friendlyMessage(err),
        });
      }
    }

    return Response.json({ ok: true, results });
  } catch (err) {
    return apiError("admin/reindex", err);
  }
}
