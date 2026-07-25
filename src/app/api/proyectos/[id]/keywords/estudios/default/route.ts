import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

// Estudio "General" del proyecto — el bucket único donde caen todas las
// importaciones (Competidores, TF-IDF, Geogrid) en vez de crear un estudio
// nuevo por cada una. Perezoso: se crea la primera vez que hace falta.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  if (project.defaultKeywordStudyId) {
    const existing = await prisma.keywordStudy.findUnique({
      where: { id: project.defaultKeywordStudyId },
    });
    if (existing) return NextResponse.json({ studyId: existing.id });
  }

  const study = await prisma.keywordStudy.create({
    data: { projectId: id, name: "General" },
  });

  try {
    await prisma.project.update({
      where: { id },
      data: { defaultKeywordStudyId: study.id },
    });
  } catch (error) {
    // Condición de carrera: otra petición ya fijó el estudio por defecto
    // mientras creábamos este. Nos quedamos con el que ganó y dejamos el
    // recién creado vacío (huérfano, sin coste ni datos que perder).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const refreshed = await prisma.project.findUnique({ where: { id } });
      if (refreshed?.defaultKeywordStudyId) {
        return NextResponse.json({ studyId: refreshed.defaultKeywordStudyId });
      }
    }
    throw error;
  }

  return NextResponse.json({ studyId: study.id });
}
