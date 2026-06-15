import { prisma } from "@/app/lib/prisma";
import { getCompany } from "@/app/lib/company";
import { deleteProductChunks } from "@/app/lib/moss";
import { apiError } from "@/app/lib/errors";

export const runtime = "nodejs";

/**
 * PATCH /api/products/[id] — update editable product fields.
 * Currently supports `warrantyMonths` (positive integer, or null to clear).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const company = await getCompany();
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product || product.companyId !== company.id) {
      return Response.json({ ok: false, error: "product not found" }, { status: 404 });
    }

    const body = await req.json();
    const raw = body?.warrantyMonths;
    // Accept a positive integer, or null/"" to clear the warranty.
    let warrantyMonths: number | null;
    if (raw === null || raw === "" || raw === undefined) {
      warrantyMonths = null;
    } else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n <= 0) {
        return Response.json(
          { ok: false, error: "warrantyMonths must be a positive integer or null" },
          { status: 400 },
        );
      }
      warrantyMonths = n;
    }

    const updated = await prisma.product.update({
      where: { id },
      data: { warrantyMonths },
    });
    return Response.json({ ok: true, product: updated });
  } catch (err) {
    return apiError("products/update", err);
  }
}

/**
 * DELETE /api/products/[id] — remove a product owned by the company.
 *
 * All Product children (resources, maintenance tasks, user inventory,
 * conversations → messages, user maintenance status) cascade on delete at the
 * DB level (see schema.prisma `onDelete: Cascade`), so a single delete is enough.
 *
 * We also purge the product's chunks from the Moss index (best-effort: a sidecar
 * hiccup won't block the delete; orphan chunks would be harmless anyway since
 * the productId is never reused). Cloudinary assets are left in place.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const company = await getCompany();
    const product = await prisma.product.findUnique({ where: { id } });

    if (!product || product.companyId !== company.id) {
      return Response.json(
        { ok: false, error: "product not found" },
        { status: 404 },
      );
    }

    await prisma.product.delete({ where: { id } });

    // Purge the product's chunks from Moss (best-effort).
    let chunksDeleted = 0;
    try {
      ({ deleted: chunksDeleted } = await deleteProductChunks(id));
    } catch (err) {
      console.error("[products/delete:moss]", err);
    }

    return Response.json({ ok: true, id, chunksDeleted });
  } catch (err) {
    return apiError("products/delete", err);
  }
}
