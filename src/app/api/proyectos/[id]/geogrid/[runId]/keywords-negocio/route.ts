import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { DataForSeoError } from "@/lib/dataforseo/client";
import { assertWithinSpendLimit, DataForSeoSpendLimitError } from "@/lib/dataforseo/spend";
import { fetchRankedKeywords, normalizeDomain } from "@/lib/competitors/dataforseo";
import { GEOGRID_KEYWORDS_DEFAULT_LIMIT } from "@/lib/dataforseo/pricing";

// POST { domain } — "Ver keywords" bajo demanda para un negocio del pack
// local del geogrid (propio o competidor). Bajo demanda y con coste real
// (a diferencia del resto del módulo 9, que solo paga Maps SERP): reutiliza
// el mismo endpoint ranked_keywords que ya usa Competidores, sin duplicar
// lógica de DataForSEO. Requiere que el negocio tenga dominio resuelto en
// su ficha de Maps — no todas las fichas lo tienen.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, runId } = await params;
  const run = await prisma.geogridRun.findUnique({ where: { id: runId }, select: { id: true, projectId: true } });
  if (!run || run.projectId !== id) {
    return NextResponse.json({ error: "Geogrid no encontrado" }, { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const rawDomain = typeof body.domain === "string" ? body.domain.trim() : "";
  if (!rawDomain) return NextResponse.json({ error: "Falta el dominio del negocio" }, { status: 400 });
  const domain = normalizeDomain(rawDomain);

  try {
    await assertWithinSpendLimit(id);
    const { items, costUsd } = await fetchRankedKeywords({
      domain,
      locationCode: 2724,
      languageCode: "es",
      limit: GEOGRID_KEYWORDS_DEFAULT_LIMIT,
    });

    if (costUsd !== null) {
      await prisma.apiUsageLog.create({
        data: { projectId: id, api: "dataforseo", endpoint: "modulo9.geogrid.keywords-negocio", model: null, costUsd },
      });
    }

    return NextResponse.json({ domain, items });
  } catch (error) {
    if (error instanceof DataForSeoSpendLimitError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof DataForSeoError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    const message = error instanceof Error ? error.message : "Error al buscar las keywords del negocio";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
