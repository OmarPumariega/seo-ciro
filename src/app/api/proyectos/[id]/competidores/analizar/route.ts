import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { DataForSeoError } from "@/lib/dataforseo/client";
import { DataForSeoSpendLimitError } from "@/lib/dataforseo/spend";
import { normalizeDomain } from "@/lib/competitors/dataforseo";
import { COMPETITORS_ANALYZE_DEFAULT_LIMIT } from "@/lib/dataforseo/pricing";
import { analyzeCompetitorVisibility } from "@/lib/competitors/analyze";

// Analiza un dominio (el del proyecto o un competidor): visibilidad + top
// keywords. PAGA (dos llamadas Labs) — salvo que ya haya un VisibilitySnapshot
// de hace menos de 7 días para este dominio, en cuyo caso lo devuelve gratis
// (analyzeCompetitorVisibility). Ver los resultados después siempre es gratis
// (lee el último snapshot).
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
    const { snapshot, fromCache } = await analyzeCompetitorVisibility(id, domain, {
      locationCode,
      languageCode,
      limit,
    });
    return NextResponse.json({ ...snapshot, fromCache }, { status: 201 });
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
