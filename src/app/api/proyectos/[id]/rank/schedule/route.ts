import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { RANK_SCAN_FREQUENCIES } from "@/lib/rank/constants";

// Programación explícita del escaneo conjunto de Rank Tracking (Módulo 5):
// deja fijado "el próximo escaneo de todas las keywords programadas será tal
// día", con una cadencia de repetición. El cron (src/lib/rank/job.ts) la lee
// como disparador ADICIONAL al criterio antiguo por keyword — no lo sustituye.
// Mismo patrón que /api/proyectos/[id]/auditoria/schedule (Módulo 8).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Cuerpo de la petición inválido" }, { status: 400 });
  }

  // frequency: null/"" = quitar la programación (vuelve al criterio por keyword).
  const rawFrequency = body.frequency;
  if (rawFrequency === null || rawFrequency === "") {
    const project = await prisma.project.update({
      where: { id },
      data: { rankScanFrequency: null, rankNextScanAt: null },
      select: { rankScanFrequency: true, rankNextScanAt: true },
    }).catch((error) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return null;
      }
      throw error;
    });
    if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    return NextResponse.json(project);
  }

  if (
    typeof rawFrequency !== "string" ||
    !(RANK_SCAN_FREQUENCIES as readonly string[]).includes(rawFrequency)
  ) {
    return NextResponse.json({ error: "Frecuencia no válida" }, { status: 400 });
  }

  const nextScanAt = typeof body.nextScanAt === "string" ? new Date(body.nextScanAt) : null;
  if (!nextScanAt || Number.isNaN(nextScanAt.getTime())) {
    return NextResponse.json({ error: "Fecha no válida" }, { status: 400 });
  }

  try {
    const project = await prisma.project.update({
      where: { id },
      data: { rankScanFrequency: rawFrequency, rankNextScanAt: nextScanAt },
      select: { rankScanFrequency: true, rankNextScanAt: true },
    });
    return NextResponse.json(project);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });
    }
    throw error;
  }
}
