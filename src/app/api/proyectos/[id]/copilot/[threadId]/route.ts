import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; threadId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, threadId } = await params;
  const thread = await prisma.copilotThread.findUnique({ where: { id: threadId } });

  if (!thread || thread.projectId !== id) {
    return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });
  }

  return NextResponse.json(thread);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; threadId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, threadId } = await params;
  const thread = await prisma.copilotThread.findUnique({ where: { id: threadId } });

  if (!thread || thread.projectId !== id) {
    return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });
  }

  await prisma.copilotThread.delete({ where: { id: threadId } });

  return NextResponse.json({ ok: true });
}
