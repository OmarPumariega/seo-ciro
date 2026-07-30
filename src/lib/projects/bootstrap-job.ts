import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { bootstrapProjectAnalysis } from "@/lib/projects/bootstrap";

// Job desacoplado del "lanzamiento completo" de un proyecto (bootstrapProjectAnalysis
// en src/lib/projects/bootstrap.ts, que no cambia). Mismo patrón pending/running/
// completed/failed que src/lib/audit/job.ts — se ejecuta fuera del ciclo
// request/response para no bloquear la navegación mientras dura (puede tardar
// minutos con varias keywords/competidores).

const STALE_RUN_TIMEOUT_MIN = 30;

// Una BootstrapRun "running" cuyo startedAt lleva demasiado tiempo (despliegue
// a mitad, proceso reiniciado...) se marca failed en vez de quedarse colgada
// para siempre en la UI. Mismo criterio que recoverStaleRuns() en audit/job.ts.
async function recoverStaleRuns() {
  const cutoff = new Date(Date.now() - STALE_RUN_TIMEOUT_MIN * 60 * 1000);
  await prisma.bootstrapRun.updateMany({
    where: { status: "running", startedAt: { lt: cutoff } },
    data: {
      status: "failed",
      errorMessage: "Análisis interrumpido (timeout)",
      completedAt: new Date(),
    },
  });
}

export async function runBootstrapJob(): Promise<{ processed: number }> {
  await recoverStaleRuns();

  const run = await prisma.bootstrapRun.findFirst({
    where: { status: "pending" },
    orderBy: { triggeredAt: "asc" },
  });

  if (!run) return { processed: 0 };

  await prisma.bootstrapRun.update({
    where: { id: run.id },
    data: { status: "running", startedAt: new Date() },
  });

  try {
    const result = await bootstrapProjectAnalysis(run.projectId);
    await prisma.bootstrapRun.update({
      where: { id: run.id },
      data: {
        status: "completed",
        completedAt: new Date(),
        result: result as unknown as Prisma.InputJsonValue,
      },
    });
    return { processed: 1 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    await prisma.bootstrapRun.update({
      where: { id: run.id },
      data: { status: "failed", completedAt: new Date(), errorMessage: message },
    });
    return { processed: 1 };
  }
}
