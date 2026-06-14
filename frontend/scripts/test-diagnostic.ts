/**
 * Isolated test for the diagnostic loop (Phase 3, item 6).
 * Run from frontend/:  npx tsx scripts/test-diagnostic.ts
 * Requires the Moss sidecar (:8000) and OPENROUTER_API_KEY in .env.
 *
 * tsx does NOT resolve the @/ alias, so this uses relative imports.
 */
import "dotenv/config";
import { runDiagnosticTurn } from "../app/lib/agent/diagnostic";

const SCOOTER = {
  id: "cmqdm9d0500029wsxzqg3hvkf",
  name: "Acme E-Scooter X1",
  category: "Scooter",
};
const PURIFIER = {
  id: "cmqdm9ecu00079wsx7j07eryb",
  name: "Acme Water Purifier W3",
  category: "Water Purifier",
};

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
  console.log("========== SCOOTER: headlight/display dead ==========");
  const h: Msg[] = [];
  await turn(SCOOTER, h, "My scooter turns on fine but the headlight and the display screen are both completely dead.");
  await turn(SCOOTER, h, "Yes it still drives normally, the motor and throttle work. Only the lights and screen are out.");
  await turn(SCOOTER, h, "I checked and the display ribbon connector looks seated properly.");

  console.log("\n\n========== PURIFIER: no water (generalization) ==========");
  const h2: Msg[] = [];
  await turn(PURIFIER, h2, "My water purifier is producing almost no water from the tap.");
}

main().catch((e) => {
  console.error("TEST FAILED:", e);
  process.exit(1);
});
