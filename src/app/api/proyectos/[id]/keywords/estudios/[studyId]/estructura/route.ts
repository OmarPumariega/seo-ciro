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
    console.error("[estructura] error del LLM:", error);
    return NextResponse.json({ error: friendlyLlmErrorMessage(error) }, { status: 502 });
  }

  // Red de seguridad: la llamada al LLM ya está cubierta arriba, pero el
  // guardado en BD no lo estaba — un fallo ahí escapaba sin capturar y el
  // frontend se quedaba "colgado" sin ningún mensaje.
  try {
    const updated = await prisma.keywordStudy.update({
      where: { id: studyId },
      data: {
        structure: result.structure as unknown as Prisma.InputJsonValue,
        structureModel: result.model,
      },
    });

    // No bloquea la respuesta: la estructura ya está guardada, un fallo al
    // registrar el coste no debe impedir que el usuario la vea. Es
    // OpenRouter, no DataForSEO: el helper existente aplica tal cual.
    try {
      await logApiUsage({
        projectId: id,
        endpoint: "modulo1.estructura",
        model: result.model,
        usage: result.usage,
      });
    } catch (error) {
      console.error("[estructura] logApiUsage falló tras generación exitosa:", error);
    }

    // Devolvemos solo lo lean de la estructura, no el estudio entero otra vez.
    return NextResponse.json({
      structure: result.structure,
      structureModel: result.model,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error("[estructura] error inesperado:", error);
    const message = error instanceof Error ? error.message : "Error inesperado al generar";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
