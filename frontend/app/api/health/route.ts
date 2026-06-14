import { prisma } from "@/app/lib/prisma";

// Health check: verifies the DB connection and reports row counts.
export async function GET() {
  try {
    const [companies, users, products, resources, maintenanceTasks, inventory] =
      await Promise.all([
        prisma.company.count(),
        prisma.user.count(),
        prisma.product.count(),
        prisma.resource.count(),
        prisma.maintenanceTask.count(),
        prisma.userInventory.count(),
      ]);

    return Response.json({
      ok: true,
      db: "connected",
      counts: {
        companies,
        users,
        products,
        resources,
        maintenanceTasks,
        inventory,
      },
    });
  } catch (err) {
    return Response.json(
      { ok: false, db: "error", error: String(err) },
      { status: 500 },
    );
  }
}
