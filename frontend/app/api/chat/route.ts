import { prisma } from "@/app/lib/prisma";
import { getDemoUser } from "@/app/lib/user";
import { apiError } from "@/app/lib/errors";

export const runtime = "nodejs";

/**
 * POST /api/chat — start a fresh diagnostic conversation for a product.
 * Body: { productId }. Returns { conversationId }.
 * Used by the chat page's "Start over" action; first load find-or-creates
 * server-side (see app/products/[id]/chat/page.tsx).
 */
export async function POST(req: Request) {
  try {
    const { productId } = await req.json();
    if (!productId) {
      return Response.json(
        { ok: false, error: "productId is required" },
        { status: 400 },
      );
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) {
      return Response.json(
        { ok: false, error: "product not found" },
        { status: 404 },
      );
    }

    const user = await getDemoUser();
    const conversation = await prisma.conversation.create({
      data: { userId: user.id, productId },
    });

    return Response.json(
      { ok: true, conversationId: conversation.id },
      { status: 201 },
    );
  } catch (err) {
    return apiError("chat/new", err);
  }
}
