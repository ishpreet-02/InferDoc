import { prisma } from "@/app/lib/prisma";
import { getCompany } from "@/app/lib/company";
import { apiError } from "@/app/lib/errors";

export const runtime = "nodejs";

// GET /api/products — list products (newest first), with resource counts.
export async function GET() {
  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { resources: true } } },
  });
  return Response.json({ products });
}

// POST /api/products — create a product for the single hardcoded company.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, category, description, imageUrl } = body ?? {};

    if (!name || !category) {
      return Response.json(
        { ok: false, error: "name and category are required" },
        { status: 400 },
      );
    }

    const company = await getCompany();
    const product = await prisma.product.create({
      data: {
        companyId: company.id,
        name: String(name),
        category: String(category),
        description: description ? String(description) : null,
        imageUrl: imageUrl ? String(imageUrl) : null,
      },
    });

    return Response.json({ ok: true, product }, { status: 201 });
  } catch (err) {
    return apiError("products/create", err);
  }
}
