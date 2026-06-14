import "dotenv/config";
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Feature B end-to-end check: synthesize a realistic AC fault display (a red
 * 7-segment "E4" error code on a dark panel), then run the real chat endpoint
 * with the photo attached and confirm the vision description visibly shifts the
 * assistant's questions / candidate causes vs. a no-image baseline.
 *
 * Requires the dev server running on :3000.
 */

// ---- tiny PNG encoder (RGBA, no deps) ---------------------------------------
function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(w: number, h: number, rgba: Buffer): Buffer {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- draw a 7-segment "E4" on a dark display --------------------------------
const W = 560;
const H = 320;
const buf = Buffer.alloc(W * H * 4);
function px(x: number, y: number, r: number, g: number, b: number) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
}
function rect(x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) px(x, y, c[0], c[1], c[2]);
}
// panel background (dark charcoal)
rect(0, 0, W, H, [22, 24, 28]);
rect(20, 20, W - 20, H - 20, [12, 13, 16]);

const ON: [number, number, number] = [235, 40, 40]; // red LED
function seg(cx: number, cy: number, name: string) {
  // segment geometry within a digit cell centered at (cx, cy)
  const T = 22, w = 96, h = 200;
  const x0 = cx - w / 2, y0 = cy - h / 2, x1 = cx + w / 2, y1 = cy + h / 2;
  const ym = cy;
  switch (name) {
    case "a": rect(x0 + T, y0, x1 - T, y0 + T, ON); break;
    case "g": rect(x0 + T, ym - T / 2, x1 - T, ym + T / 2, ON); break;
    case "d": rect(x0 + T, y1 - T, x1 - T, y1, ON); break;
    case "f": rect(x0, y0 + T, x0 + T, ym, ON); break;
    case "b": rect(x1 - T, y0 + T, x1, ym, ON); break;
    case "e": rect(x0, ym, x0 + T, y1 - T, ON); break;
    case "c": rect(x1 - T, ym, x1, y1 - T, ON); break;
  }
}
function digit(cx: number, segs: string[]) {
  for (const s of segs) seg(cx, H / 2, s);
}
digit(180, ["a", "f", "g", "e", "d"]); // E
digit(380, ["f", "g", "b", "c"]); // 4

const OUT_DIR = path.join(process.cwd(), "public", "test");
mkdirSync(OUT_DIR, { recursive: true });
const pngPath = path.join(OUT_DIR, "ac-error-e4.png");
const png = encodePng(W, H, buf);
writeFileSync(pngPath, png);
const dataUrl = `data:image/png;base64,${png.toString("base64")}`;
console.log(`Generated ${pngPath} (${png.length} bytes)`);

// ---- run the flow against the live server -----------------------------------
const BASE = "http://localhost:3000";

async function getAcProductId(): Promise<string> {
  const res = await fetch(`${BASE}/api/products`);
  const data = await res.json();
  const ac = data.products.find((p: { category: string }) => p.category === "Air Conditioner");
  if (!ac) throw new Error("AC product not found");
  return ac.id;
}
async function newConversation(productId: string): Promise<string> {
  const res = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`chat create failed: ${JSON.stringify(data)}`);
  return data.conversationId;
}
async function send(conversationId: string, content: string, imageBase64?: string) {
  const res = await fetch(`${BASE}/api/chat/${conversationId}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, imageBase64 }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`message failed: ${JSON.stringify(data)}`);
  return data.assistantMessage;
}
function summarize(label: string, a: { content: string; readout: { stage: string; candidateCauses: { cause: string; confidence: number }[]; questions: string[]; recommendation: { fix: string } | null } }) {
  console.log(`\n========== ${label} ==========`);
  console.log("stage:", a.readout.stage);
  console.log("reply:", a.content);
  if (a.readout.questions.length)
    console.log("questions:\n  - " + a.readout.questions.join("\n  - "));
  if (a.readout.candidateCauses.length)
    console.log(
      "causes:\n  - " +
        a.readout.candidateCauses
          .map((c) => `${c.cause} (${Math.round(c.confidence * 100)}%)`)
          .join("\n  - "),
    );
  if (a.readout.recommendation) console.log("fix:", a.readout.recommendation.fix);
}

async function main() {
  const acId = await getAcProductId();
  const sameMsg = "My AC stopped cooling.";

  // Baseline: no image.
  const c1 = await newConversation(acId);
  const baseline = await send(c1, sameMsg);
  summarize("BASELINE (no photo)", baseline);

  // With photo: same words, plus the E4 panel.
  const c2 = await newConversation(acId);
  const withImg = await send(c2, sameMsg, dataUrl);
  summarize("WITH PHOTO (E4 error code)", withImg);

  console.log(
    "\n→ Compare the two: the photo run should reference the error code / display reading.",
  );
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
