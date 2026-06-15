import { prisma } from "@/app/lib/prisma";
import { getCompany } from "@/app/lib/company";
import { getProductHealth } from "@/app/lib/health";
import { apiError } from "@/app/lib/errors";

export const runtime = "nodejs";

/**
 * GET /api/products/[id]/health — product health analytics for the company
 * dashboard, mined from the product's diagnostic conversations.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const company = await getCompany();
    const product = await prisma.product.findUnique({ where: { id } });
    if (!product || product.companyId !== company.id) {
      return Response.json({ ok: false, error: "product not found" }, { status: 404 });
    }

    const health = await getProductHealth(id);
    return Response.json({ ok: true, health });
  } catch (err) {
    return apiError("products/health", err);
  }
}
