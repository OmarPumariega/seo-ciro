import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { DataForSeoError } from "@/lib/dataforseo/client";
import {
  assertWithinSpendLimit,
  DataForSeoSpendLimitError,
} from "@/lib/dataforseo/spend";
import { fetchTopOrganic } from "@/lib/tfidf/serp";
import { computeTfidf } from "@/lib/tfidf/tfidf";

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

  const keyword = typeof body.keyword === "string" ? body.keyword.trim() : "";
  if (!keyword) {
    return NextResponse.json({ error: "Debes indicar una keyword" }, { status: 400 });
  }

  const languageCode =
    typeof body.languageCode === "string" && /^[a-z]{2}$/i.test(body.languageCode)
      ? body.languageCode.toLowerCase()
      : "es";
  const rawLocation = Number(body.locationCode);
  const locationCode = Number.isInteger(rawLocation) && rawLocation > 0 ? rawLocation : 2724;

  // Tope de gasto ANTES de la llamada real a DataForSEO.
  try {
    await assertWithinSpendLimit(id);
  } catch (error) {
    if (error instanceof DataForSeoSpendLimitError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }

  // --- SERP: top-10 orgánico de la keyword ---
  let serp;
  try {
    serp = await fetchTopOrganic({ keyword, locationCode, languageCode });
  } catch (error) {
    if (error instanceof DataForSeoError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }

  if (serp.results.length === 0) {
    return NextResponse.json(
      { error: "La búsqueda no devolvió resultados orgánicos para esta keyword." },
      { status: 422 }
    );
  }

  // --- TF-IDF sobre el corpus scrapeado ---
  const { terms, sources } = await computeTfidf(serp.results);

  // --- Registro del coste real del SERP ---
  await prisma.apiUsageLog.create({
    data: {
      projectId: id,
      api: "dataforseo",
      endpoint: "tfidf",
      model: null,
      costUsd: serp.costUsd,
    },
  });

  return NextResponse.json(
    { terms, sources, costUsd: serp.costUsd },
    { status: 200 }
  );
}
