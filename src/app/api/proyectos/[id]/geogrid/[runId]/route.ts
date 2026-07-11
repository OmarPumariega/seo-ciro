import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

// Detalle de un geogrid (para el polling de la UI mientras está pending/running
// y para recargar uno del historial).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, runId } = await params;
  const run = await prisma.geogridRun.findUnique({ where: { id: runId } });

  if (!run || run.projectId !== id) {
    return NextResponse.json({ error: "Geogrid no encontrado" }, { status: 404 });
  }

  return NextResponse.json(run);
}
