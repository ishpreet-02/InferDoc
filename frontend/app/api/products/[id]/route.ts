import { prisma } from "@/app/lib/prisma";
import { getCompany } from "@/app/lib/company";
import { apiError } from "@/app/lib/errors";

export const runtime = "nodejs";

/**
 * DELETE /api/products/[id] — remove a product owned by the company.
 *
 * All Product children (resources, maintenance tasks, user inventory,
 * conversations → messages, user maintenance status) cascade on delete at the
 * DB level (see schema.prisma `onDelete: Cascade`), so a single delete is enough.
 *
 * The product's Moss chunks and Cloudinary PDFs are left in place — they are
 * orphaned but harmless (retrieval filters by productId, which is never reused).
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

    return Response.json({ ok: true, id });
  } catch (err) {
    return apiError("products/delete", err);
  }
}
