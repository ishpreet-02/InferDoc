import { prisma } from "@/app/lib/prisma";
import { getCompany } from "@/app/lib/company";
import { deleteProductChunks } from "@/app/lib/moss";
import { apiError } from "@/app/lib/errors";

export const runtime = "nodejs";

/**
 * DELETE /api/resources/[id] — remove a single resource.
 *
 * Purges the resource's chunks from the Moss index (best-effort) and deletes the
 * row. The Cloudinary asset is left in place (harmless orphan).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const company = await getCompany();
    const resource = await prisma.resource.findUnique({
      where: { id },
      include: { product: { select: { companyId: true } } },
    });

    if (!resource || resource.product.companyId !== company.id) {
      return Response.json({ ok: false, error: "resource not found" }, { status: 404 });
    }

    let chunksDeleted = 0;
    try {
      ({ deleted: chunksDeleted } = await deleteProductChunks(
        resource.productId,
        resource.id,
      ));
    } catch (err) {
      console.error("[resources/delete:moss]", err);
    }

    await prisma.resource.delete({ where: { id } });

    return Response.json({ ok: true, id, chunksDeleted });
  } catch (err) {
    return apiError("resources/delete", err);
  }
}
