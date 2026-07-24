import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { DataForSeoError } from "@/lib/dataforseo/client";
import { DataForSeoSpendLimitError, assertWithinSpendLimit } from "@/lib/dataforseo/spend";
import { fetchBacklinkSummary, fetchTopBacklinks, normalizeDomain } from "@/lib/backlinks/dataforseo";
import { BACKLINKS_LIST_DEFAULT_LIMIT } from "@/lib/dataforseo/pricing";

// Analiza el perfil de backlinks de un dominio (el del proyecto o un
// competidor). PAGA (dos llamadas a la API de Backlinks de DataForSEO, un
// producto separado del resto de la app — ver dataforseo.ts). Crea un
// BacklinkSnapshot (acumula tendencia). Ver los resultados después es
// gratis (lee el último snapshot).
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

  const rawLimit = Number(body.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0 && rawLimit <= 100 ? rawLimit : BACKLINKS_LIST_DEFAULT_LIMIT;

  try {
    await assertWithinSpendLimit(id);
  } catch (error) {
    if (error instanceof DataForSeoSpendLimitError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }

  try {
    const [summary, top] = await Promise.all([
      fetchBacklinkSummary(domain),
      fetchTopBacklinks(domain, limit),
    ]);

    const snapshot = await prisma.backlinkSnapshot.create({
      data: {
        projectId: id,
        domain,
        rank: summary.data.rank,
        backlinksTotal: summary.data.backlinksTotal,
        referringDomains: summary.data.referringDomains,
        referringMainDomains: summary.data.referringMainDomains,
        dofollowBacklinks: summary.data.dofollowBacklinks,
        nofollowBacklinks: summary.data.nofollowBacklinks,
        brokenBacklinks: summary.data.brokenBacklinks,
        topBacklinks: top.items as unknown as Prisma.InputJsonValue,
      },
    });

    for (const [endpoint, cost] of [
      ["backlinks.summary", summary.costUsd],
      ["backlinks.top", top.costUsd],
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
