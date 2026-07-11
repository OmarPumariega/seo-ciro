import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { DataForSeoError } from "@/lib/dataforseo/client";
import { DataForSeoSpendLimitError, assertWithinSpendLimit } from "@/lib/dataforseo/spend";
import { fetchSuggestions } from "@/lib/keywords/suggestions";

// Busca keywords relacionadas con una semilla (modo Planificador). NO persiste
// nada en el estudio: devuelve la lista para que el usuario decida cuáles
// añadir. Las métricas se cachean al traerlas (ver suggestions.ts) → añadir
// después es cache hit. El coste real se registra en ApiUsageLog.
const MAX_LIMIT = 100;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; studyId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, studyId } = await params;
  const study = await prisma.keywordStudy.findUnique({ where: { id: studyId } });
  if (!study || study.projectId !== id) {
    return NextResponse.json({ error: "Estudio no encontrado" }, { status: 404 });
  }

  const seed = (req.nextUrl.searchParams.get("seed") ?? "").trim();
  if (!seed) {
    return NextResponse.json({ error: "Indica una keyword semilla" }, { status: 400 });
  }
  const rawLimit = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 && rawLimit <= MAX_LIMIT ? rawLimit : 30;

  try {
    await assertWithinSpendLimit(id);
  } catch (error) {
    if (error instanceof DataForSeoSpendLimitError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }

  try {
    const { items, costUsd } = await fetchSuggestions({
      seed,
      locationCode: study.locationCode,
      languageCode: study.languageCode,
      limit,
    });

    if (costUsd !== null) {
      await prisma.apiUsageLog.create({
        data: {
          projectId: id,
          api: "dataforseo",
          endpoint: "modulo1.sugerencias",
          model: null,
          costUsd,
        },
      });
    }

    return NextResponse.json({ items, costUsd });
  } catch (error) {
    if (error instanceof DataForSeoError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
