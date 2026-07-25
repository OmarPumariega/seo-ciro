import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import {
  getOrComputeTfidfResult,
  TfidfNoResultsError,
  DataForSeoError,
  DataForSeoSpendLimitError,
} from "@/lib/tfidf/get-or-compute";

// GET: devuelve los resultados TF-IDF ya guardados para este proyecto (los que
// se auto-generan al chequear keywords en Rank Tracking + los manuales). Así el
// módulo muestra datos listos sin tener que ejecutar nada.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const results = await prisma.tfidfResult.findMany({
    where: { projectId: id },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { id: true, keyword: true, result: true, updatedAt: true },
  });

  return NextResponse.json(results);
}

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

  let outcome;
  try {
    outcome = await getOrComputeTfidfResult({ projectId: id, keyword, languageCode, locationCode });
  } catch (error) {
    if (error instanceof DataForSeoSpendLimitError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof TfidfNoResultsError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof DataForSeoError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }

  return NextResponse.json(
    { ...outcome.result, costUsd: outcome.costUsd },
    { status: 200 }
  );
}
