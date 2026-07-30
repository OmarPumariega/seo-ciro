import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { DataForSeoError } from "@/lib/dataforseo/client";
import { DataForSeoSpendLimitError } from "@/lib/dataforseo/spend";
import { normalizeDomain } from "@/lib/competitors/dataforseo";
import { COMPETITORS_GAP_DEFAULT_LIMIT } from "@/lib/dataforseo/pricing";
import { computeCompetitorContentGap } from "@/lib/competitors/analyze";

// Content gap de un competidor: keywords por las que rankea y el proyecto NO.
// PAGA (domain_intersection) — salvo que ya se haya calculado hace menos de 7
// días, en cuyo caso se devuelve gratis (computeCompetitorContentGap). Se
// guarda en el competidor (contentGap) para verlo gratis después.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; competitorId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, competitorId } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  if (!project.domain) {
    return NextResponse.json({ error: "El proyecto no tiene dominio configurado." }, { status: 422 });
  }

  const competitor = await prisma.competitor.findUnique({ where: { id: competitorId } });
  if (!competitor || competitor.projectId !== id) {
    return NextResponse.json({ error: "Competidor no encontrado" }, { status: 404 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* body opcional */
  }
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
      : COMPETITORS_GAP_DEFAULT_LIMIT;

  try {
    const { contentGap, contentGapAt, fromCache } = await computeCompetitorContentGap(
      id,
      competitor,
      normalizeDomain(project.domain),
      { locationCode, languageCode, limit }
    );
    return NextResponse.json({ items: contentGap, contentGapAt, fromCache }, { status: 201 });
  } catch (error) {
    if (error instanceof DataForSeoSpendLimitError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof DataForSeoError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
