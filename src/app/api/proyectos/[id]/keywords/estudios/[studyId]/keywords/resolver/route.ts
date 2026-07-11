import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { DataForSeoError } from "@/lib/keywords/dataforseo";
import { DataForSeoSpendLimitError } from "@/lib/dataforseo/spend";
import { fetchKeywordData } from "@/lib/keywords/orchestrate";
import { normalizeKeyword } from "@/lib/keywords/normalize";
import { recomputeStudyPriorities } from "@/lib/keywords/study";

// Modo "pegar lista": resuelve volumen/intención de una lista de keywords
// (caché → DataForSEO) y las añade al estudio existente. Es la alternativa al
// modo sugerencias para cuando ya tienes una lista hecha.
export async function POST(
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

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const raw = typeof body.keywords === "string" ? body.keywords : "";
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const line of raw.split("\n")) {
    const kw = normalizeKeyword(line);
    if (kw && !seen.has(kw)) {
      seen.add(kw);
      keywords.push(kw);
    }
  }
  if (keywords.length === 0) {
    return NextResponse.json({ error: "Debes indicar al menos una keyword" }, { status: 400 });
  }

  // Quita las que ya están en el estudio antes de pagar por resolverlas.
  const already = await prisma.keyword.findMany({
    where: { studyId, keyword: { in: keywords } },
    select: { keyword: true },
  });
  const taken = new Set(already.map((k) => k.keyword));
  const pending = keywords.filter((k) => !taken.has(k));

  let data;
  try {
    data = await fetchKeywordData({ keywords: pending, languageCode: study.languageCode, locationCode: study.locationCode });
  } catch (error) {
    if (error instanceof DataForSeoSpendLimitError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof DataForSeoError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }

  if (pending.length > 0) {
    await prisma.keyword.createMany({
      data: pending.map((kw) => {
        const d = data.data.get(kw);
        return {
          studyId,
          keyword: kw,
          searchVolume: d?.searchVolume ?? null,
          competition: d?.competition ?? null,
          cpc: d?.cpc ?? null,
          intent: d?.intent ?? null,
          priority: 0,
        };
      }),
    });
    await recomputeStudyPriorities(studyId);
  }

  // Registro de coste (0 filas si todo era caché o ya estaba).
  for (const log of data.usageLogs) {
    await prisma.apiUsageLog.create({
      data: { projectId: id, api: "dataforseo", endpoint: log.endpoint, model: null, costUsd: log.costUsd },
    });
  }

  return NextResponse.json({ added: pending.length, skipped: taken.size }, { status: 201 });
}
