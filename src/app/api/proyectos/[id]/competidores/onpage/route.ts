import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { DataForSeoError } from "@/lib/dataforseo/client";
import { DataForSeoSpendLimitError } from "@/lib/dataforseo/spend";
import { analyzeOnPage } from "@/lib/onpage/analyze";

// GET ?url=... — último análisis on-page ya guardado para esa URL, gratis,
// no dispara nada (mismo patrón que GET /competidores).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Falta el parámetro url" }, { status: 400 });

  const analysis = await prisma.onPageAnalysis.findFirst({
    where: { projectId: id, url },
    orderBy: { fetchedAt: "desc" },
  });

  return NextResponse.json(analysis);
}

// POST { url } — analiza una página suelta (propia o de un competidor):
// recuento de palabras/caracteres/frases, jerarquía de encabezados,
// incidencias de título/meta/H1, legibilidad. PAGA (DataForSEO On-Page API,
// instant_pages) salvo que ya haya un análisis de esa URL de hace menos de
// 7 días, en cuyo caso se devuelve gratis (analyzeOnPage).
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

  const url = typeof body.url === "string" ? body.url.trim() : "";
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "URL inválida" }, { status: 400 });
  }

  try {
    const { analysis, fromCache } = await analyzeOnPage(id, url);
    return NextResponse.json({ ...analysis, fromCache }, { status: 201 });
  } catch (error) {
    if (error instanceof DataForSeoSpendLimitError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof DataForSeoError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("[onpage] error inesperado:", error);
    const message = error instanceof Error ? error.message : "Error inesperado al analizar la página";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
