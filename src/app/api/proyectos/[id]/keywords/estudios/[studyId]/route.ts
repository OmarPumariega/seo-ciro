import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; studyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, studyId } = await params;

  const study = await prisma.keywordStudy.findUnique({
    where: { id: studyId },
    include: {
      // Orden secundario por volumen para desempatar prioridades que
      // redondean al mismo entero.
      keywords: { orderBy: [{ priority: "desc" }, { searchVolume: "desc" }] },
    },
  });

  // Verificación de propiedad: el study debe pertenecer al proyecto de la
  // ruta. Si no, 404 (no revelar existencia). Mismo patrón que
  // auditorias/[auditId]/route.ts.
  if (!study || study.projectId !== id) {
    return NextResponse.json({ error: "Estudio no encontrado" }, { status: 404 });
  }

  return NextResponse.json(study);
}
