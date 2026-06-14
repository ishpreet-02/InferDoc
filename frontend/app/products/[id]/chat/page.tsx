import { notFound } from "next/navigation";
import { prisma } from "@/app/lib/prisma";
import { getDemoUser } from "@/app/lib/user";
import type { Readout } from "@/app/lib/agent/diagnostic";
import { DiagnosticChat, type ChatMessage } from "./DiagnosticChat";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const product = await prisma.product.findUnique({ where: { id } });
  if (!product) notFound();

  // Conversation creation on first load: reuse the most recent conversation for
  // this demo user + product, or create a fresh one. ("New chat" makes a new
  // one via POST /api/chat.)
  const user = await getDemoUser();
  let conversation = await prisma.conversation.findFirst({
    where: { userId: user.id, productId: id },
    orderBy: { createdAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation) {
    conversation = await prisma.conversation.create({
      data: { userId: user.id, productId: id },
      include: { messages: true },
    });
  }

  const initialMessages: ChatMessage[] = conversation.messages.map((m) => {
    if (m.role === "USER") {
      const meta = (m.citations ?? null) as { imageUrl?: string } | null;
      return {
        id: m.id,
        role: m.role,
        content: m.content,
        imageUrl: meta?.imageUrl,
      };
    }
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      readout: (m.citations as Readout | null) ?? undefined,
    };
  });

  return (
    <DiagnosticChat
      product={{ id: product.id, name: product.name, category: product.category }}
      conversationId={conversation.id}
      initialMessages={initialMessages}
    />
  );
}
