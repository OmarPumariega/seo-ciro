import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";
import { estimateBootstrapCost } from "@/lib/projects/bootstrap";

// Lanzamiento completo de un proyecto: importa las keywords de los estudios
// al Rank Tracking y las chequea (lo que dispara TF-IDF gratis vía SerpCache),
// analiza visibilidad y content gap de cada competidor, y devuelve un resumen.
//
// Lo invoca:
//   • El paso "Lanzar" del wizard de alta.
//   • El botón "Re-procesar proyecto" de la ficha.
//
// El trabajo real (bootstrapProjectAnalysis, en src/lib/projects/bootstrap.ts)
// puede tardar minutos con varias keywords/competidores, así que corre en
// background — mismo patrón que Auditoría/Geogrid: se crea un BootstrapRun
// "pending" y se dispara el job vía import dinámico fire-and-forget (sin
// bloquear este request), con el cron interno como respaldo
// (runBootstrapJob() en instrumentation-node.ts). El frontend hace polling
// sobre GET /bootstrap/runs/[runId].
//
// Es idempotente: una segunda ejecución solo hace lo que falte. Si el tope de
// gasto salta a mitad, lo hecho queda hecho y se devuelve en el resumen.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const estimate = await estimateBootstrapCost(id);
  return NextResponse.json(estimate);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  if (!project.domain) {
    return NextResponse.json(
      {
        error:
          "El proyecto no tiene dominio configurado. Añádelo en la ficha del proyecto antes de lanzar el análisis.",
      },
      { status: 422 }
    );
  }

  const existing = await prisma.bootstrapRun.findFirst({
    where: { projectId: id, status: { in: ["pending", "running"] } },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Ya hay un análisis en curso para este proyecto.", run: existing },
      { status: 409 }
    );
  }

  const run = await prisma.bootstrapRun.create({ data: { projectId: id } });

  // Dispara el procesamiento EN BACKGROUND (import dinámico + fire-and-forget).
  // Así funciona en dev (el cron NO corre en dev) y en producción sin esperar
  // al siguiente tick del cron. La UI hace polling para ver el resultado.
  import("@/lib/projects/bootstrap-job")
    .then(({ runBootstrapJob }) => runBootstrapJob())
    .catch((e) => console.error("[bootstrap] fire-and-forget:", e));

  return NextResponse.json(run, { status: 202 });
}
