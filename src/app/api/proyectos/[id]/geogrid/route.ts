import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

const GRID_SIZES = [3, 5, 7];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const runs = await prisma.geogridRun.findMany({
    where: { projectId: id },
    orderBy: { triggeredAt: "desc" },
    take: 20,
  });

  return NextResponse.json(runs);
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

  // El geogrid solo aplica a negocios locales con coordenadas.
  if (!project.isLocalBusiness) {
    return NextResponse.json(
      { error: "Este proyecto no está marcado como negocio local. Activa 'Es un negocio local' en la ficha." },
      { status: 422 }
    );
  }
  if (project.lat === null || project.lng === null) {
    return NextResponse.json(
      { error: "Faltan las coordenadas (lat/lng) del negocio. Defínelas en la ficha del proyecto." },
      { status: 422 }
    );
  }

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

  const rawGrid = Number(body.gridSize);
  const gridSize = GRID_SIZES.includes(rawGrid) ? rawGrid : 5;
  const rawRadius = Number(body.radiusKm);
  const radiusKm = Number.isFinite(rawRadius) && rawRadius > 0 && rawRadius <= 50 ? rawRadius : 3;

  const run = await prisma.geogridRun.create({
    data: {
      projectId: id,
      keyword,
      gridSize,
      radiusKm,
      centerLat: project.lat,
      centerLng: project.lng,
    },
  });

  // Se devuelve pending; el cron la procesa en segundo plano y la UI hace
  // polling (como las auditorías del Módulo 8).
  return NextResponse.json(run, { status: 201 });
}
