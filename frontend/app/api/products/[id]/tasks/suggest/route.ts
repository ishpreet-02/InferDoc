import { prisma } from "@/app/lib/prisma";
import { getCompany } from "@/app/lib/company";
import { extractMaintenanceTasks } from "@/app/lib/agent/maintenance-extract";
import { apiError } from "@/app/lib/errors";

export const runtime = "nodejs";

/**
 * POST /api/products/[id]/tasks/suggest — propose a maintenance schedule by
 * running the product's manual text through the LLM. Returns suggestions only;
 * the dashboard reviews them and creates the chosen ones via POST .../tasks.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const company = await getCompany();
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        resources: {
          where: { type: "PDF", extractedText: { not: null } },
          select: { extractedText: true },
        },
      },
    });

    if (!product || product.companyId !== company.id) {
      return Response.json({ ok: false, error: "product not found" }, { status: 404 });
    }

    const manualText = product.resources
      .map((r) => r.extractedText ?? "")
      .join("\n\n")
      .trim();

    if (!manualText) {
      return Response.json(
        {
          ok: false,
          error: "No manual text for this product — upload a PDF manual first.",
        },
        { status: 400 },
      );
    }

    const suggestions = await extractMaintenanceTasks({
      product: product.name,
      category: product.category,
      manualText,
    });

    return Response.json({ ok: true, suggestions });
  } catch (err) {
    return apiError("products/tasks/suggest", err);
  }
}
