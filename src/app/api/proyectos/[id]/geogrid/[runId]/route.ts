import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { NextRequest, NextResponse } from "next/server";

// Detalle de un geogrid (para el polling de la UI mientras está pending/running
// y para recargar uno del historial).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, runId } = await params;
  const run = await prisma.geogridRun.findUnique({ where: { id: runId } });

  if (!run || run.projectId !== id) {
    return NextResponse.json({ error: "Geogrid no encontrado" }, { status: 404 });
  }

  return NextResponse.json(run);
}

// Borra un geogrid. GeogridRun no tiene tablas hijas (los puntos viven como
// JSON embebido en `points`), así que un delete simple basta — el contenido
// del análisis se va con la fila. No se devuelve el crédito gastado en
// ApiUsageLog (vive por projectId sin FK al run, como histórico de gasto —
// coherente con borrar un estudio o un competidor).
//
// Bloquea el borrado si el run sigue pending/running (409): evita que el job
// del cron intente actualizar una fila ya borrada (su try/catch lo traga,
// pero deja un run "fantasma" en la UI mientras se procesa). El usuario
// espera a que termine para borrarlo.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; runId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id, runId } = await params;
  const existing = await prisma.geogridRun.findUnique({
    where: { id: runId },
    select: { projectId: true, status: true, keyword: true },
  });
  if (!existing || existing.projectId !== id) {
    return NextResponse.json({ error: "Geogrid no encontrado" }, { status: 404 });
  }
  if (existing.status === "pending" || existing.status === "running") {
    return NextResponse.json(
      {
        error:
          "El geogrid todavía se está procesando. Espera a que termine (status completed o failed) para borrarlo.",
      },
      { status: 409 }
    );
  }

  await prisma.geogridRun.delete({ where: { id: runId } });
  return NextResponse.json({ ok: true });
}

