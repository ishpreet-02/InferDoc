import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Isolated check for Feature A maintenance logic. tsx does NOT resolve the @/
// alias, so this mirrors getMaintenanceForProduct with relative imports.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DAY_MS = 86_400_000;
const DUE_SOON_DAYS = 14;

function display(nextDueAt: Date | null): string {
  if (!nextDueAt) return "OK";
  const d = (nextDueAt.getTime() - Date.now()) / DAY_MS;
  if (d < 0) return "OVERDUE";
  if (d <= DUE_SOON_DAYS) return "DUE_SOON";
  return "OK";
}

async function dump(userId: string, productId: string, label: string) {
  const tasks = await prisma.maintenanceTask.findMany({
    where: { productId },
    include: { status: { where: { userId } } },
    orderBy: { intervalDays: "asc" },
  });
  console.log(`\n── ${label} ──`);
  for (const t of tasks) {
    const s = t.status[0];
    const due = s?.nextDueAt ?? null;
    const days = due ? Math.ceil((due.getTime() - Date.now()) / DAY_MS) : null;
    console.log(
      `  [${display(due).padEnd(8)}] ${t.title}  · every ${t.intervalDays}d` +
        `  · next=${due ? due.toISOString().slice(0, 10) : "—"}` +
        `  · last=${s?.lastDoneAt ? s.lastDoneAt.toISOString().slice(0, 10) : "—"}` +
        (days != null ? `  · ${days}d` : ""),
    );
  }
  return tasks;
}

async function main() {
  const user = await prisma.user.findFirstOrThrow({ orderBy: { id: "asc" } });
  const scooter = await prisma.product.findFirstOrThrow({ where: { category: "Scooter" } });
  const ac = await prisma.product.findFirstOrThrow({ where: { category: "Air Conditioner" } });

  const inv = await prisma.userInventory.findMany({
    where: { userId: user.id },
    include: { product: true },
  });
  console.log("Inventory:", inv.map((i) => i.product.name).join(", "));

  await dump(user.id, scooter.id, "Scooter maintenance");
  const acTasks = await dump(user.id, ac.id, "AC maintenance (before)");

  // Mark the first AC task complete and verify the status moves.
  const target = acTasks[0].status[0];
  if (!target) throw new Error("AC has no maintenance status — seeding failed");
  console.log(`\n→ Marking complete: "${acTasks[0].title}" (status ${target.id})`);
  const before = display(target.nextDueAt);
  const now = new Date();
  const nextDueAt = new Date(now.getTime() + acTasks[0].intervalDays * DAY_MS);
  await prisma.userMaintenanceStatus.update({
    where: { id: target.id },
    data: { lastDoneAt: now, nextDueAt, status: "DONE" },
  });

  await dump(user.id, ac.id, "AC maintenance (after mark complete)");

  const overdue = await prisma.userMaintenanceStatus.count({
    where: { userId: user.id, nextDueAt: { lt: new Date() } },
  });
  console.log(`\nOverdue across all products (nav badge): ${overdue}`);
  console.log(
    `\n✅ Mark-complete check: "${acTasks[0].title}" went ${before} → ${display(nextDueAt)} (lastDoneAt set, nextDueAt rolled +${acTasks[0].intervalDays}d)`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌", e);
    await prisma.$disconnect();
    process.exit(1);
  });
