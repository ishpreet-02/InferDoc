/**
 * Isolated test for the diagnostic loop (Phase 3, item 6).
 * Run from frontend/:  npx tsx scripts/test-diagnostic.ts
 * Requires the Moss sidecar (:8000) and OPENROUTER_API_KEY in .env.
 *
 * tsx does NOT resolve the @/ alias, so this uses relative imports.
 *
 * There are no seeded products — this picks a real product (one that has a PDF
 * resource indexed into Moss) from the DB and runs a generic symptom through
 * the loop. Add a product + manual via the company dashboard first.
 */
import "dotenv/config";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { runDiagnosticTurn } from "../app/lib/agent/diagnostic";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

type Msg = { role: "USER" | "ASSISTANT"; content: string };

async function turn(
  product: { id: string; name: string; category: string },
  history: Msg[],
  userText: string,
) {
  history.push({ role: "USER", content: userText });
  const t = await runDiagnosticTurn(product, history);
  history.push({ role: "ASSISTANT", content: t.content });
  console.log("\n────────────────────────────────────────");
  console.log(`👤 ${userText}`);
  console.log(`🩺 [${t.readout.stage}] sources=${t.sourcesRetrieved}`);
  console.log(`   reply: ${t.content}`);
  if (t.readout.candidateCauses.length) {
    console.log("   causes:");
    for (const c of t.readout.candidateCauses) {
      console.log(
        `     - (${c.confidence.toFixed(2)}${c.source ? ` src${c.source}` : ""}) ${c.cause}`,
      );
    }
  }
  if (t.readout.questions.length) {
    console.log("   questions:");
    t.readout.questions.forEach((q) => console.log(`     ? ${q}`));
  }
  if (t.readout.recommendation) {
    console.log(`   ✅ FIX${t.readout.recommendation.source ? ` (src${t.readout.recommendation.source})` : ""}: ${t.readout.recommendation.fix}`);
  }
  if (t.readout.citations.length) {
    console.log("   citations:");
    t.readout.citations.forEach((c) =>
      console.log(`     📄 ${c.resourceTitle} p.${c.page} — ${c.excerpt.slice(0, 80)}…`),
    );
  }
  return t;
}

async function main() {
  const product = await prisma.product.findFirst({
    where: { resources: { some: { type: "PDF" } } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, category: true },
  });
  if (!product) {
    throw new Error(
      "No product with a PDF resource found — add one via the company dashboard first.",
    );
  }

  console.log(`========== ${product.name} (${product.category}) ==========`);
  const h: Msg[] = [];
  await turn(product, h, "It suddenly stopped working and won't turn on at all.");
  await turn(product, h, "Yes, it's plugged in and the outlet works for other devices.");
  await turn(product, h, "I don't see any error code or warning light.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("TEST FAILED:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
