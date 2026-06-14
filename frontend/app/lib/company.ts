import { prisma } from "./prisma";

// No auth in this build — there is a single hardcoded company (AcmeMobility,
// created by the seed). This resolves its id for the dashboard/API routes.
export async function getCompany() {
  const company = await prisma.company.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (!company) {
    throw new Error("No company found — run `npx tsx prisma/seed.ts` first.");
  }
  return company;
}
