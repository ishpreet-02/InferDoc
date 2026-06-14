import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/app/lib/prisma";
import { runDiagnosticTurn } from "@/app/lib/agent/diagnostic";
import { describeImage } from "@/app/lib/agent/llm";
import { apiError } from "@/app/lib/errors";

export const runtime = "nodejs";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/** Per-message extras stored in Message.citations for USER messages. */
type UserMeta = { imageUrl?: string; imageDescription?: string };

/**
 * Fold a USER message's image analysis into its text so the (text-only)
 * diagnostic loop reasons over what the photo shows. The raw description is
 * stored in citations, not content, so the chat bubble stays clean (B4/B5).
 */
function effectiveContent(content: string, citations: unknown): string {
  const meta = (citations ?? undefined) as UserMeta | undefined;
  const desc = meta?.imageDescription;
  if (!desc) return content;
  const base = content && content !== "(shared a photo)" ? `${content}\n\n` : "";
  return `${base}[Customer shared a photo. Visual analysis: ${desc}]`;
}

/** Decode a data URL (or bare base64) and persist it under /public/uploads. */
async function saveImage(dataUrl: string): Promise<string> {
  const match = /^data:(image\/(png|jpe?g|webp));base64,(.+)$/i.exec(dataUrl.trim());
  const ext = match ? match[2].replace("jpeg", "jpg") : "png";
  const b64 = match ? match[3] : dataUrl;
  const bytes = Buffer.from(b64, "base64");
  await mkdir(UPLOAD_DIR, { recursive: true });
  const fileName = `chat-${randomUUID().slice(0, 8)}.${ext}`;
  await writeFile(path.join(UPLOAD_DIR, fileName), bytes);
  return `/uploads/${fileName}`;
}

/**
 * POST /api/chat/[conversationId]/message — the diagnostic turn endpoint.
 *
 * Persists the customer's USER message (optionally with an attached photo), runs
 * the iterative loop (intake → retrieve → decide → respond), persists the
 * ASSISTANT message with the structured readout in `citations`, returns both.
 *
 * Body: { content?: string, imageBase64?: string }. When a photo is present a
 * vision pre-step describes it and the description is injected into the symptom
 * history before retrieval/decision run.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  try {
    const { conversationId } = await params;
    const { content, imageBase64 } = await req.json();

    const text = String(content ?? "").trim();
    const hasImage = typeof imageBase64 === "string" && imageBase64.length > 0;
    if (!text && !hasImage) {
      return Response.json(
        { ok: false, error: "content or image is required" },
        { status: 400 },
      );
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { product: true },
    });
    if (!conversation) {
      return Response.json(
        { ok: false, error: "conversation not found" },
        { status: 404 },
      );
    }

    // 0. Vision pre-step (B3): describe the photo, save it for the thumbnail.
    let meta: UserMeta | undefined;
    if (hasImage) {
      const imageUrl = await saveImage(imageBase64);
      let imageDescription: string | undefined;
      try {
        imageDescription = await describeImage(imageBase64, {
          product: conversation.product.name,
          category: conversation.product.category,
          symptom: text || undefined,
        });
      } catch (err) {
        // Degrade gracefully — the chat still works without the analysis.
        console.error("vision pre-step failed:", err);
      }
      meta = { imageUrl, imageDescription };
    }

    // 1. Persist the customer's message (image extras live in citations).
    const userMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "USER",
        content: text || "(shared a photo)",
        citations: meta ?? undefined,
      },
    });

    // 2. Load the transcript; fold any image analysis into the content (B4).
    const history = await prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true, citations: true },
    });

    // 3. Run intake → retrieve → decide → respond.
    const turn = await runDiagnosticTurn(
      {
        id: conversation.productId,
        name: conversation.product.name,
        category: conversation.product.category,
      },
      history.map((m) => ({
        role: m.role,
        content:
          m.role === "USER" ? effectiveContent(m.content, m.citations) : m.content,
      })),
    );

    // 4. Persist the assistant turn; the structured readout lives in `citations`.
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId,
        role: "ASSISTANT",
        content: turn.content,
        citations: turn.readout,
      },
    });

    // 5. If we recommended a fix, mark the conversation resolved.
    if (turn.readout.stage === "RECOMMENDING") {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { status: "RESOLVED" },
      });
    }

    return Response.json({
      ok: true,
      userMessage: {
        id: userMessage.id,
        role: userMessage.role,
        content: userMessage.content,
        imageUrl: meta?.imageUrl,
      },
      assistantMessage: {
        id: assistantMessage.id,
        role: assistantMessage.role,
        content: assistantMessage.content,
        createdAt: assistantMessage.createdAt,
        readout: turn.readout,
      },
    });
  } catch (err) {
    return apiError("chat/message", err);
  }
}
