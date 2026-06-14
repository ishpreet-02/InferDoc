import "dotenv/config";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { MANUALS, renderManualPdf, manualToText, type Manual } from "./manuals";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const MANUALS_DIR = path.join(process.cwd(), "public", "manuals");

function intervalToDays(interval: string): number {
  const lower = interval.toLowerCase();
  if (lower.includes("month")) {
    const m = lower.match(/(\d+)\s*month/);
    return m ? parseInt(m[1], 10) * 30 : 30;
  }
  if (lower.includes("year")) {
    const m = lower.match(/(\d+)\s*year/);
    return m ? parseInt(m[1], 10) * 365 : 365;
  }
  return 30; // "Monthly" etc.
}

// Product definitions keyed to a manual slug.
const PRODUCTS: {
  slug: string;
  name: string;
  category: string;
  description: string;
}[] = [
  {
    slug: "acme-escooter-x1",
    name: "Acme E-Scooter X1",
    category: "Scooter",
    description: "36V lithium-ion electric scooter, 350W hub motor, 25 km range.",
  },
  {
    slug: "acme-water-purifier-w3",
    name: "Acme Water Purifier W3",
    category: "Water Purifier",
    description: "4-stage RO + UV countertop water purifier with 1.2L tank.",
  },
  {
    slug: "acme-split-ac-15t",
    name: "Acme Split AC 1.5T",
    category: "Air Conditioner",
    description: "1.5-ton R-32 inverter split air conditioner.",
  },
];

async function main() {
  console.log("→ Resetting tables…");
  // Delete in dependency order (cascades would handle most, but be explicit).
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.userMaintenanceStatus.deleteMany();
  await prisma.maintenanceTask.deleteMany();
  await prisma.userInventory.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.product.deleteMany();
  await prisma.user.deleteMany();
  await prisma.company.deleteMany();

  console.log("→ Creating company + user…");
  const company = await prisma.company.create({
    data: { name: "AcmeMobility", email: "support@acmemobility.example" },
  });

  const user = await prisma.user.create({
    data: { name: "Demo User", email: "demo@acmemobility.example" },
  });

  console.log("→ Generating PDF manuals…");
  mkdirSync(MANUALS_DIR, { recursive: true });

  const manualBySlug = new Map<string, Manual>(MANUALS.map((m) => [m.slug, m]));
  const createdProducts: { id: string; slug: string }[] = [];

  for (const p of PRODUCTS) {
    const manual = manualBySlug.get(p.slug);
    if (!manual) throw new Error(`No manual for slug ${p.slug}`);

    const product = await prisma.product.create({
      data: {
        companyId: company.id,
        name: p.name,
        category: p.category,
        description: p.description,
      },
    });
    createdProducts.push({ id: product.id, slug: p.slug });

    // Render the PDF into /public/manuals/<slug>.pdf
    const fileName = `${p.slug}.pdf`;
    const outPath = path.join(MANUALS_DIR, fileName);
    await renderManualPdf(manual, outPath);
    console.log(`   ✓ ${fileName}`);

    // Resource row points at the public path; extractedText holds the body.
    await prisma.resource.create({
      data: {
        productId: product.id,
        type: "PDF",
        url: `/manuals/${fileName}`,
        title: "Service Manual",
        extractedText: manualToText(manual),
      },
    });

    // 2-3 maintenance tasks from the manual schedule.
    const tasks = manual.maintenance.slice(0, 3);
    for (const t of tasks) {
      const task = await prisma.maintenanceTask.create({
        data: {
          productId: product.id,
          title: t.task,
          intervalDays: intervalToDays(t.interval),
          sourceExcerpt: `${t.interval} — ${t.notes}`,
        },
      });

      // For products the demo user owns, also create a per-user status.
      // (Set below only for the scooter, which is added to inventory.)
      void task;
    }
  }

  console.log("→ Adding scooter to demo user inventory…");
  const scooter = createdProducts.find((p) => p.slug === "acme-escooter-x1")!;
  await prisma.userInventory.create({
    data: {
      userId: user.id,
      productId: scooter.id,
      nickname: "My X1",
    },
  });

  // Create per-user maintenance status for the owned scooter's tasks.
  const scooterTasks = await prisma.maintenanceTask.findMany({
    where: { productId: scooter.id },
  });
  const now = new Date();
  for (let i = 0; i < scooterTasks.length; i++) {
    const t = scooterTasks[i];
    // Make the first task overdue for demo flavor; others pending/future.
    const overdue = i === 0;
    const lastDoneAt = new Date(
      now.getTime() - (overdue ? t.intervalDays + 20 : 10) * 86_400_000,
    );
    const nextDueAt = new Date(
      lastDoneAt.getTime() + t.intervalDays * 86_400_000,
    );
    await prisma.userMaintenanceStatus.create({
      data: {
        userId: user.id,
        taskId: t.id,
        lastDoneAt,
        nextDueAt,
        status: overdue ? "OVERDUE" : "PENDING",
      },
    });
  }

  // Summary
  const counts = {
    companies: await prisma.company.count(),
    users: await prisma.user.count(),
    products: await prisma.product.count(),
    resources: await prisma.resource.count(),
    maintenanceTasks: await prisma.maintenanceTask.count(),
    inventory: await prisma.userInventory.count(),
    maintenanceStatus: await prisma.userMaintenanceStatus.count(),
  };
  console.log("✅ Seed complete:", counts);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌ Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
