import { prisma } from "@/app/lib/prisma";
import { getCompany } from "@/app/lib/company";
import { apiError } from "@/app/lib/errors";

export const runtime = "nodejs";

const DAY_MS = 86_400_000;

async function ownedProduct(id: string) {
  const company = await getCompany();
  const product = await prisma.product.findUnique({ where: { id } });
  if (!product || product.companyId !== company.id) return null;
  return product;
}

/** GET /api/products/[id]/tasks — list a product's maintenance tasks. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!(await ownedProduct(id))) {
      return Response.json({ ok: false, error: "product not found" }, { status: 404 });
    }
    const tasks = await prisma.maintenanceTask.findMany({
      where: { productId: id },
      orderBy: { intervalDays: "asc" },
    });
    return Response.json({ ok: true, tasks });
  } catch (err) {
    return apiError("products/tasks/list", err);
  }
}

/**
 * POST /api/products/[id]/tasks — add a maintenance task to a product.
 * Body: { title, intervalDays, sourceExcerpt? }.
 *
 * Also backfills a UserMaintenanceStatus (PENDING, nextDueAt = now + interval)
 * for every user who already owns the product, so the task shows up in their
 * service log immediately (the inventory route only seeds statuses at add-time).
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

    const body = await req.json();
    const title = String(body?.title ?? "").trim();
    const intervalDays = Number(body?.intervalDays);
    const sourceExcerpt = body?.sourceExcerpt
      ? String(body.sourceExcerpt).trim()
      : null;

    if (!title) {
      return Response.json({ ok: false, error: "title is required" }, { status: 400 });
    }
    if (!Number.isInteger(intervalDays) || intervalDays <= 0) {
      return Response.json(
        { ok: false, error: "intervalDays must be a positive integer" },
        { status: 400 },
      );
    }

    const task = await prisma.maintenanceTask.create({
      data: { productId: id, title, intervalDays, sourceExcerpt },
    });

    // Backfill statuses for existing owners who don't already track this task.
    const owners = await prisma.userInventory.findMany({
      where: { productId: id },
      select: { userId: true },
    });
    const now = new Date();
    const nextDueAt = new Date(now.getTime() + intervalDays * DAY_MS);
    if (owners.length > 0) {
      await prisma.userMaintenanceStatus.createMany({
        data: owners.map((o) => ({
          userId: o.userId,
          taskId: task.id,
          nextDueAt,
          status: "PENDING" as const,
        })),
        skipDuplicates: true,
      });
    }

    return Response.json(
      { ok: true, task, ownersBackfilled: owners.length },
      { status: 201 },
    );
  } catch (err) {
    return apiError("products/tasks/create", err);
  }
}
