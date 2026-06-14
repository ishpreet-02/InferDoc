import { prisma } from "@/app/lib/prisma";
import { getCompany } from "@/app/lib/company";
import { apiError } from "@/app/lib/errors";

export const runtime = "nodejs";

/**
 * DELETE /api/products/[id]/tasks/[taskId] — remove a maintenance task.
 * Its UserMaintenanceStatus rows cascade (schema `onDelete: Cascade`).
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  try {
    const { id, taskId } = await params;

    const company = await getCompany();
    const task = await prisma.maintenanceTask.findUnique({
      where: { id: taskId },
      include: { product: { select: { id: true, companyId: true } } },
    });

    if (!task || task.productId !== id || task.product.companyId !== company.id) {
      return Response.json({ ok: false, error: "task not found" }, { status: 404 });
    }

    await prisma.maintenanceTask.delete({ where: { id: taskId } });
    return Response.json({ ok: true, id: taskId });
  } catch (err) {
    return apiError("products/tasks/delete", err);
  }
}
