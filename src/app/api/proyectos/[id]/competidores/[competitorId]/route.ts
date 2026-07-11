import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; competitorId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, competitorId } = await params;
  const existing = await prisma.competitor.findUnique({ where: { id: competitorId } });
  if (!existing || existing.projectId !== id) {
    return NextResponse.json({ error: "Competidor no encontrado" }, { status: 404 });
  }
  await prisma.competitor.delete({ where: { id: competitorId } });
  return NextResponse.json({ ok: true });
}
