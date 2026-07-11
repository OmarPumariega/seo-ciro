import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { recomputeStudyPriorities } from "@/lib/keywords/study";

// Elimina una keyword del estudio y recalcula prioridades del resto.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; studyId: string; keywordId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, studyId, keywordId } = await params;
  const kw = await prisma.keyword.findUnique({ where: { id: keywordId } });
  if (!kw || kw.studyId !== studyId) {
    return NextResponse.json({ error: "Keyword no encontrada" }, { status: 404 });
  }
  // Verifica que el estudio pertenece al proyecto de la ruta.
  const study = await prisma.keywordStudy.findUnique({ where: { id: studyId }, select: { projectId: true } });
  if (!study || study.projectId !== id) {
    return NextResponse.json({ error: "Estudio no encontrado" }, { status: 404 });
  }

  await prisma.keyword.delete({ where: { id: keywordId } });
  await recomputeStudyPriorities(studyId);
  return NextResponse.json({ ok: true });
}
