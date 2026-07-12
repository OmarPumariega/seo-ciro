import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { generateStructure } from "@/lib/keywords/structure";
import { logApiUsage } from "@/lib/seo/usage-log";
import { friendlyLlmErrorMessage } from "@/lib/seo/llm";

// Genera la estructura de URLs/encabezados de un estudio a partir de sus
// keywords ya persistidas (sin nueva llamada a DataForSEO). Sobrescribe la
// estructura anterior si existía — en v1 no hay versionado de este sub-feature,
// updatedAt es la única pista de auditoría.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; studyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, studyId } = await params;

  const study = await prisma.keywordStudy.findUnique({
    where: { id: studyId },
    include: { keywords: true },
  });

  if (!study || study.projectId !== id) {
    return NextResponse.json({ error: "Estudio no encontrado" }, { status: 404 });
  }

  let result;
  try {
    result = await generateStructure({
      studyName: study.name,
      keywords: study.keywords.map((k) => ({
        keyword: k.keyword,
        searchVolume: k.searchVolume,
        intent: k.intent,
        priority: k.priority,
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: friendlyLlmErrorMessage(error) }, { status: 502 });
  }

  const updated = await prisma.keywordStudy.update({
    where: { id: studyId },
    data: {
      structure: result.structure as unknown as Prisma.InputJsonValue,
      structureModel: result.model,
    },
  });

  // Es OpenRouter, no DataForSEO: el helper existente aplica tal cual.
  await logApiUsage({
    projectId: id,
    endpoint: "modulo1.estructura",
    model: result.model,
    usage: result.usage,
  });

  // Devolvemos solo lo lean de la estructura, no el estudio entero otra vez.
  return NextResponse.json({
    structure: result.structure,
    structureModel: result.model,
    updatedAt: updated.updatedAt,
  });
}
