import { prisma } from "@/app/lib/prisma";
import { getCompany } from "@/app/lib/company";
import { apiError } from "@/app/lib/errors";

export const runtime = "nodejs";

/** DELETE /api/products/[id]/recalls/[recallId] — retract a recall/notice. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; recallId: string }> },
) {
  try {
    const { id, recallId } = await params;

    const company = await getCompany();
    const recall = await prisma.recall.findUnique({
      where: { id: recallId },
      include: { product: { select: { id: true, companyId: true } } },
    });
    if (!recall || recall.productId !== id || recall.product.companyId !== company.id) {
      return Response.json({ ok: false, error: "recall not found" }, { status: 404 });
    }

    await prisma.recall.delete({ where: { id: recallId } });
    return Response.json({ ok: true, id: recallId });
  } catch (err) {
    return apiError("products/recalls/delete", err);
  }
}
