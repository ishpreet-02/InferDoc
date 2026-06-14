import { prisma } from "@/app/lib/prisma";
import { getDemoUser } from "@/app/lib/user";
import { apiError } from "@/app/lib/errors";

export const runtime = "nodejs";

const DAY_MS = 86_400_000;

/**
 * POST /api/inventory — add a product to the demo user's "My Products".
 * Body: { productId, nickname? }.
 *
 * Idempotent: re-adding an owned product is a no-op for the inventory row. On
 * (first) add we also seed a UserMaintenanceStatus for every MaintenanceTask the
 * product defines, with nextDueAt = now + intervalDays (A3). Tasks that already
 * have a status for this user are skipped so re-adds don't reset the schedule.
 */
export async function POST(req: Request) {
  try {
    const { productId, nickname } = await req.json();
    if (!productId) {
      return Response.json(
        { ok: false, error: "productId is required" },
        { status: 400 },
      );
    }

    const product = await prisma.product.findUnique({
      where: { id: productId },
      include: { maintenanceTasks: true },
    });
    if (!product) {
      return Response.json(
        { ok: false, error: "product not found" },
        { status: 404 },
      );
    }

    const user = await getDemoUser();

    const inventory = await prisma.userInventory.upsert({
      where: { userId_productId: { userId: user.id, productId } },
      update: nickname ? { nickname: String(nickname) } : {},
      create: {
        userId: user.id,
        productId,
        nickname: nickname ? String(nickname) : null,
      },
    });

    // Seed maintenance statuses for any tasks the user doesn't track yet.
    const existing = await prisma.userMaintenanceStatus.findMany({
      where: { userId: user.id, taskId: { in: product.maintenanceTasks.map((t) => t.id) } },
      select: { taskId: true },
    });
    const tracked = new Set(existing.map((e) => e.taskId));
    const now = new Date();

    const toCreate = product.maintenanceTasks
      .filter((t) => !tracked.has(t.id))
      .map((t) => ({
        userId: user.id,
        taskId: t.id,
        // No service history yet — schedule the first service one interval out.
        nextDueAt: new Date(now.getTime() + t.intervalDays * DAY_MS),
        status: "PENDING" as const,
      }));

    if (toCreate.length > 0) {
      await prisma.userMaintenanceStatus.createMany({ data: toCreate });
    }

    return Response.json(
      {
        ok: true,
        inventoryId: inventory.id,
        tasksSeeded: toCreate.length,
        tasksTotal: product.maintenanceTasks.length,
      },
      { status: 201 },
    );
  } catch (err) {
    return apiError("inventory/add", err);
  }
}
