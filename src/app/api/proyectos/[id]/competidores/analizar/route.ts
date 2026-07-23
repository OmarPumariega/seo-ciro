import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { DataForSeoError } from "@/lib/dataforseo/client";
import { DataForSeoSpendLimitError, assertWithinSpendLimit } from "@/lib/dataforseo/spend";
import { fetchDomainOverview, fetchRankedKeywords, normalizeDomain } from "@/lib/competitors/dataforseo";
import { COMPETITORS_ANALYZE_DEFAULT_LIMIT } from "@/lib/dataforseo/pricing";

// Analiza un dominio (el del proyecto o un competidor): visibilidad + top
// keywords. PAGA (dos llamadas Labs). Crea un VisibilitySnapshot (acumula
// tendencia). Ver los resultados después es gratis (lee el último snapshot).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const domain = normalizeDomain(typeof body.domain === "string" ? body.domain : "");
  if (!domain) return NextResponse.json({ error: "Dominio inválido" }, { status: 400 });

  const languageCode =
    typeof body.languageCode === "string" && /^[a-z]{2}$/i.test(body.languageCode)
      ? body.languageCode.toLowerCase()
      : "es";
  const rawLocation = Number(body.locationCode);
  const locationCode = Number.isInteger(rawLocation) && rawLocation > 0 ? rawLocation : 2724;
  const rawLimit = Number(body.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0 && rawLimit <= 1000
      ? rawLimit
      : COMPETITORS_ANALYZE_DEFAULT_LIMIT;

  try {
    await assertWithinSpendLimit(id);
  } catch (error) {
    if (error instanceof DataForSeoSpendLimitError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }

  try {
    const [overview, ranked] = await Promise.all([
      fetchDomainOverview({ domain, locationCode, languageCode }),
      fetchRankedKeywords({ domain, locationCode, languageCode, limit }),
    ]);

    const snapshot = await prisma.visibilitySnapshot.create({
      data: {
        projectId: id,
        domain,
        organicTraffic: overview.organicTraffic,
        organicKeywords: overview.organicKeywords,
        positionBuckets: overview.positionBuckets ?? undefined,
        avgPosition: overview.avgPosition ?? undefined,
        topKeywords: ranked.items as unknown as Prisma.InputJsonValue,
      },
    });

    // Dos llamadas reales, dos filas de coste (mismo patrón que Módulo 1).
    for (const [endpoint, cost] of [
      ["competidores.visibilidad", overview.costUsd],
      ["competidores.ranked", ranked.costUsd],
    ] as const) {
      if (cost !== null) {
        await prisma.apiUsageLog.create({
          data: { projectId: id, api: "dataforseo", endpoint, model: null, costUsd: cost },
        });
      }
    }

    return NextResponse.json(snapshot, { status: 201 });
  } catch (error) {
    if (error instanceof DataForSeoError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
