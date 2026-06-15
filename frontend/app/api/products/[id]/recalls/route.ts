import { prisma } from "@/app/lib/prisma";
import { getCompany } from "@/app/lib/company";
import { apiError } from "@/app/lib/errors";

export const runtime = "nodejs";

const SEVERITIES = ["NOTICE", "SAFETY", "RECALL"] as const;
type Severity = (typeof SEVERITIES)[number];

async function ownedProduct(id: string) {
  const company = await getCompany();
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product || product.companyId !== company.id) return null;
  return product;
}

/** GET /api/products/[id]/recalls — list a product's recalls/notices. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!(await ownedProduct(id))) {
      return Response.json({ ok: false, error: "product not found" }, { status: 404 });
    }
    const recalls = await prisma.recall.findMany({
      where: { productId: id },
      orderBy: { issuedAt: "desc" },
    });
    return Response.json({ ok: true, recalls });
  } catch (err) {
    return apiError("products/recalls/list", err);
  }
}

/**
 * POST /api/products/[id]/recalls — publish a recall / safety notice.
 * Body: { title, body, severity?, url? }. Every owner of the product sees it.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!(await ownedProduct(id))) {
      return Response.json({ ok: false, error: "product not found" }, { status: 404 });
    }

    const data = await req.json();
    const title = String(data?.title ?? "").trim();
    const body = String(data?.body ?? "").trim();
    const severity: Severity = SEVERITIES.includes(data?.severity)
      ? data.severity
      : "NOTICE";
    const url = data?.url ? String(data.url).trim() : null;

    if (!title || !body) {
      return Response.json(
        { ok: false, error: "title and body are required" },
        { status: 400 },
      );
    }

    const recall = await prisma.recall.create({
      data: { productId: id, title, body, severity, url },
    });
    return Response.json({ ok: true, recall }, { status: 201 });
  } catch (err) {
    return apiError("products/recalls/create", err);
  }
}
