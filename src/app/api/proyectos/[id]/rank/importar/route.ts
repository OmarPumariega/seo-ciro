import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { ALLOWED_DEPTHS } from "@/lib/rank/serp";
import { RANK_FREQUENCIES } from "@/lib/rank/constants";
import { resolveLocationName } from "@/lib/rank/locations";

const DEVICES = ["desktop", "mobile"] as const;

// Importa las keywords de un estudio del Módulo 1 como keywords de
// seguimiento. Reutiliza el idioma/ubicación del estudio (tiene sentido
// rastrear con la misma configuración geográfica con la que se investigó).
// Las duplicadas (mismo keyword+idioma+ubicación+device ya seguidas) se
// ignoran, no se duplican.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
  if (!project.domain) {
    return NextResponse.json(
      { error: "El proyecto no tiene dominio configurado." },
      { status: 422 }
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  const studyId = typeof body.studyId === "string" ? body.studyId : "";
  const study = await prisma.keywordStudy.findUnique({
    where: { id: studyId },
    include: { keywords: true },
  });
  if (!study || study.projectId !== id) {
    return NextResponse.json({ error: "Estudio no encontrado" }, { status: 404 });
  }

  const device = typeof body.device === "string" && (DEVICES as readonly string[]).includes(body.device) ? body.device : "desktop";
  const frequency =
    typeof body.frequency === "string" && (RANK_FREQUENCIES as readonly string[]).includes(body.frequency)
      ? body.frequency
      : "weekly";
  const rawDepth = Number(body.depth);
  const depth = (ALLOWED_DEPTHS as readonly number[]).includes(rawDepth) ? rawDepth : 10;
  // Por defecto se agrupan bajo el nombre del estudio de origen — así se
  // puede filtrar la tabla de rank tracking por de dónde vino cada keyword
  // sin que el usuario tenga que teclear nada.
  const group =
    typeof body.group === "string" && body.group.trim() ? body.group.trim().slice(0, 60) : study.name.slice(0, 60);

  // Construye el set de (keyword) ya seguidas con esta misma config para
  // saltar duplicados sin hacer N queries.
  const already = await prisma.rankKeyword.findMany({
    where: { projectId: id, locationCode: study.locationCode, languageCode: study.languageCode, device },
    select: { keyword: true },
  });
  const tracked = new Set(already.map((k) => k.keyword));

  let created = 0;
  let skipped = 0;
  // Resolvemos el nombre legible de la ubicación (p.ej. "Oviedo,Oviedo,...")
  // desde el JSON estático para que la UI de Rank Tracking muestre la
  // ubicación correcta en vez de "Nacional".
  const locationName = resolveLocationName(study.locationCode);
  for (const k of study.keywords) {
    if (tracked.has(k.keyword)) {
      skipped++;
      continue;
    }
    await prisma.rankKeyword.create({
      data: {
        projectId: id,
        keyword: k.keyword,
        locationCode: study.locationCode,
        languageCode: study.languageCode,
        device,
        frequency,
        depth,
        group,
        locationName,
      },
    });
    tracked.add(k.keyword);
    created++;
  }

  return NextResponse.json({ created, skipped, total: study.keywords.length }, { status: 201 });
}
