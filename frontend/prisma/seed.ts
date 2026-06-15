import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * Minimal bootstrap. This build has no auth, so it relies on a single company
 * (AcmeMobility, resolved by getCompany) and a single demo user (getDemoUser)
 * existing. This seed only ensures those two rows exist.
 *
 * It is idempotent and NON-destructive: it never deletes products, so products
 * added through the dashboard (with their Cloudinary-hosted manuals) are
 * preserved across runs. There are no demo/sample products.
 */
async function main() {
  let company = await prisma.company.findFirst({ orderBy: { createdAt: "asc" } });
  if (!company) {
    company = await prisma.company.create({
      data: { name: "AcmeMobility", email: "support@acmemobility.example" },
    });
    console.log(`→ Created company “${company.name}”`);
  } else {
    console.log(`→ Company already exists: “${company.name}”`);
  }

  // User.email is @unique, so this is a safe upsert.
  const user = await prisma.user.upsert({
    where: { email: "demo@acmemobility.example" },
    update: {},
    create: { name: "Demo User", email: "demo@acmemobility.example" },
  });
  console.log(`→ Demo user ready: ${user.email}`);

  const counts = {
    companies: await prisma.company.count(),
    users: await prisma.user.count(),
    products: await prisma.product.count(),
  };
  console.log("✅ Bootstrap complete:", counts);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("❌ Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
