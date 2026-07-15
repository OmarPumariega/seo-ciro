import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { DataForSeoError } from "@/lib/keywords/dataforseo";
import { DataForSeoSpendLimitError } from "@/lib/dataforseo/spend";
import { fetchKeywordData } from "@/lib/keywords/orchestrate";
import { computePriorities } from "@/lib/keywords/priority";
import { normalizeKeyword } from "@/lib/keywords/normalize";

// Tope por estudio: por encima del "50-200 típico" del spec (margen para
// pegar un briefing real sin fricción), muy por debajo del límite técnico de
// DataForSEO (1000) y de lo que haría inmanejable el prompt de estructura.
const MAX_KEYWORDS = 300;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;

  // Historial ligero: sin incluir las keywords (solo un _count para el badge)
  // ni el blob `structure` (solo un flag hasStructure). Igual de ligero que
  // los listados de titulos-meta/schema/contenido.
  const studies = await prisma.keywordStudy.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      name: true,
      notes: true,
      languageCode: true,
      locationCode: true,
      createdAt: true,
      updatedAt: true,
      structure: true,
      _count: { select: { keywords: true } },
    },
  });

  const light = studies.map(({ structure, ...rest }) => ({
    ...rest,
    hasStructure: structure !== null,
  }));

  return NextResponse.json(light);
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

  // --- Parseo del textarea (una keyword por línea) ---
  const rawKeywords = typeof body.keywords === "string" ? body.keywords : "";
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const line of rawKeywords.split("\n")) {
    const kw = normalizeKeyword(line);
    if (kw && !seen.has(kw)) {
      seen.add(kw);
      keywords.push(kw);
    }
  }

  if (keywords.length > MAX_KEYWORDS) {
    return NextResponse.json(
      { error: `Máximo ${MAX_KEYWORDS} keywords por estudio (indicaste ${keywords.length})` },
      { status: 400 }
    );
  }

  // --- Nombre del estudio ---
  const name =
    typeof body.name === "string" && body.name.trim()
      ? body.name.trim().slice(0, 120)
      : `Estudio del ${new Date().toLocaleDateString("es-ES")}`;

  // --- Idioma / ubicación (override; defaults España) ---
  const languageCode =
    typeof body.languageCode === "string" && /^[a-z]{2}$/i.test(body.languageCode)
      ? body.languageCode.toLowerCase()
      : "es";
  const rawLocation = Number(body.locationCode);
  const locationCode = Number.isInteger(rawLocation) && rawLocation > 0 ? rawLocation : 2724;

  // Modo workspace: crear estudio vacío (sin keywords iniciales). Se llena
  // después con sugerencias o pegando una lista (ver rutas .../keywords).
  if (keywords.length === 0) {
    const study = await prisma.keywordStudy.create({
      data: { projectId: id, name, languageCode, locationCode },
      include: { keywords: true },
    });
    return NextResponse.json(study, { status: 201 });
  }

  // --- Resolución de datos (caché → DataForSEO) ---
  let data;
  try {
    data = await fetchKeywordData({ keywords, languageCode, locationCode, projectId: id });
  } catch (error) {
    if (error instanceof DataForSeoSpendLimitError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof DataForSeoError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }

  // --- Priorización ---
  const priorities = computePriorities(
    keywords.map((kw) => ({ keyword: kw, searchVolume: data.data.get(kw)?.searchVolume ?? null }))
  );

  // --- Persistencia (escritura anidada: estudio + keywords en un create) ---
  const study = await prisma.keywordStudy.create({
    data: {
      projectId: id,
      name,
      languageCode,
      locationCode,
      keywords: {
        create: keywords.map((kw) => {
          const d = data.data.get(kw);
          return {
            keyword: kw,
            searchVolume: d?.searchVolume ?? null,
            competition: d?.competition ?? null,
            cpc: d?.cpc ?? null,
            intent: d?.intent ?? null,
            priority: priorities.get(kw) ?? 0,
          };
        }),
      },
    },
    include: { keywords: true },
  });

  // --- Registro de coste (después de persistir, igual que titulos-meta) ---
  // 0, 1 o 2 filas: si todo estaba en caché, ninguna (la prueba del caché).
  for (const log of data.usageLogs) {
    await prisma.apiUsageLog.create({
      data: {
        projectId: id,
        api: "dataforseo",
        endpoint: log.endpoint,
        model: null,
        costUsd: log.costUsd,
      },
    });
  }

  // Orden de presentación: prioridad desc, y volumen como desempate secundario
  // para los empates que redondean al mismo entero.
  study.keywords.sort(
    (a, b) => b.priority - a.priority || (b.searchVolume ?? 0) - (a.searchVolume ?? 0)
  );

  return NextResponse.json(study, { status: 201 });
}
