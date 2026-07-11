import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { DataForSeoError } from "@/lib/dataforseo/client";
import { DataForSeoSpendLimitError, assertWithinSpendLimit } from "@/lib/dataforseo/spend";
import { fetchContentGap, normalizeDomain } from "@/lib/competitors/dataforseo";

// Content gap de un competidor: keywords por las que rankea y el proyecto NO.
// PAGA (domain_intersection). Se guarda en el competidor (contentGap) para verlo
// gratis después hasta la siguiente actualización.
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
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 && rawLimit <= 1000 ? rawLimit : 50;

  try {
    await assertWithinSpendLimit(id);
  } catch (error) {
    if (error instanceof DataForSeoSpendLimitError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }

  try {
    const { items, costUsd } = await fetchContentGap({
      competitorDomain: competitor.domain,
      projectDomain: normalizeDomain(project.domain),
      locationCode,
      languageCode,
      limit,
    });

    const updated = await prisma.competitor.update({
      where: { id: competitorId },
      data: { contentGap: items as unknown as Prisma.InputJsonValue, contentGapAt: new Date() },
    });

    if (costUsd !== null) {
      await prisma.apiUsageLog.create({
        data: { projectId: id, api: "dataforseo", endpoint: "competidores.contentgap", model: null, costUsd },
      });
    }

    return NextResponse.json({ items: updated.contentGap, contentGapAt: updated.contentGapAt }, { status: 201 });
  } catch (error) {
    if (error instanceof DataForSeoError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }
}
