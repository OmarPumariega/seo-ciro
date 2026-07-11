import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; auditId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, auditId } = await params;
  const run = await prisma.auditRun.findUnique({
    where: { id: auditId },
    include: { pages: true },
  });

  if (!run || run.projectId !== id) {
    return NextResponse.json({ error: "Auditoría no encontrada" }, { status: 404 });
  }

  return NextResponse.json(run);
}
