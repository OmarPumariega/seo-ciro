import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { buildProjectContext } from "@/lib/copilot/context";
import { copilotReply, type CopilotMessage } from "@/lib/copilot/chat";
import { logApiUsage } from "@/lib/seo/usage-log";
import { friendlyLlmErrorMessage } from "@/lib/seo/llm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const threads = await prisma.copilotThread.findMany({
    where: { projectId: id },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { id: true, title: true, updatedAt: true },
  });

  return NextResponse.json(threads);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Debes indicar un mensaje" }, { status: 400 });
  }

  const threadIdReq = typeof body.threadId === "string" ? body.threadId : null;

  // Carga el historial del hilo existente (si viene threadId) para dar
  // continuidad a la conversación. Valida que pertenezca al proyecto.
  let history: CopilotMessage[] = [];
  let resolvedThreadId = threadIdReq;
  if (threadIdReq) {
    const thread = await prisma.copilotThread.findUnique({ where: { id: threadIdReq } });
    if (!thread || thread.projectId !== id) {
      return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });
    }
    history = (thread.messages as CopilotMessage[]) ?? [];
  }

  const userMessage: CopilotMessage = { role: "user", content: message };
  const systemContext = await buildProjectContext(id);

  let reply;
  try {
    reply = await copilotReply({
      systemContext,
      messages: [...history, userMessage],
    });
  } catch (error) {
    return NextResponse.json({ error: friendlyLlmErrorMessage(error) }, { status: 502 });
  }

  if (!reply.content) {
    return NextResponse.json({ error: "Sin respuesta del modelo" }, { status: 502 });
  }

  const assistantMessage: CopilotMessage = { role: "assistant", content: reply.content };
  const allMessages = [...history, userMessage, assistantMessage];

  if (resolvedThreadId) {
    await prisma.copilotThread.update({
      where: { id: resolvedThreadId },
      data: { messages: allMessages },
    });
  } else {
    const title = message.length > 40 ? message.slice(0, 40).trimEnd() + "…" : message;
    const created = await prisma.copilotThread.create({
      data: { projectId: id, title, messages: allMessages },
    });
    resolvedThreadId = created.id;
  }

  await logApiUsage({
    projectId: id,
    endpoint: "copilot",
    model: reply.model,
    usage: reply.usage,
  });

  return NextResponse.json(
    { threadId: resolvedThreadId, message: reply.content },
    { status: 201 }
  );
}
