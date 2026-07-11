import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { assertWithinSpendLimit, DataForSeoSpendLimitError } from "@/lib/dataforseo/spend";
import { generateGridPoints } from "@/lib/geogrid/grid";
import { checkMapsRank, normalizeDomain } from "@/lib/geogrid/maps";

const STALE_TIMEOUT_MIN = 15;

// Job de fondo del Módulo 9: procesa un geogrid pending (rejilla N×N de puntos
// consultando Maps SERP). Reutiliza el mismo poller que audit (Módulo 8) y
// rank (Módulo 5), sin Redis. Una rejilla 5×5 son 25 llamadas (~75s): el job
// bloquea el tick del cron mientras la procesa, igual que hace el crawler del
// Módulo 8 con su crawl. Aceptable para una herramienta interna de uso manual.
export async function runGeogridJob(): Promise<{ processed: number }> {
  // Recupera runs atascados en "running" (proceso reiniciado a mitad).
  const cutoff = new Date(Date.now() - STALE_TIMEOUT_MIN * 60 * 1000);
  await prisma.geogridRun.updateMany({
    where: { status: "running", startedAt: { lt: cutoff } },
    data: { status: "failed", errorMessage: "Geogrid interrumpido (timeout)", completedAt: new Date() },
  });

  const run = await prisma.geogridRun.findFirst({
    where: { status: "pending" },
    orderBy: { triggeredAt: "asc" },
    include: { project: true },
  });
  if (!run) return { processed: 0 };

  await prisma.geogridRun.update({
    where: { id: run.id },
    data: { status: "running", startedAt: new Date() },
  });

  try {
    // Tope de gasto: una rejilla son N² llamadas (hasta 49). Comprobamos ANTES
    // de empezar para no dejar un mapa a medias. Si el tope ya se alcanzó, el
    // run queda failed sin gastar nada.
    await assertWithinSpendLimit(run.projectId);

    const projectDomain = run.project.domain ? normalizeDomain(run.project.domain) : null;
    const points = generateGridPoints(run.centerLat, run.centerLng, run.gridSize, run.radiusKm);

    const results: Array<{ row: number; col: number; lat: number; lng: number; position: number | null; title: string | null }> = [];
    let totalCost = 0;
    let found = 0;
    let posSum = 0;

    for (const p of points) {
      const { rank, costUsd } = await checkMapsRank({
        keyword: run.keyword,
        lat: p.lat,
        lng: p.lng,
        languageCode: "es",
        projectDomain,
        businessName: run.project.businessName ?? null,
        gbpName: run.project.gbpName ?? null,
        gbpPlaceId: run.project.gbpPlaceId ?? null,
      });
      results.push({ row: p.row, col: p.col, lat: p.lat, lng: p.lng, position: rank.position, title: rank.title });
      if (costUsd !== null) totalCost += costUsd;
      if (rank.position !== null) {
        found++;
        posSum += rank.position;
      }
    }

    await prisma.$transaction([
      prisma.geogridRun.update({
        where: { id: run.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          points: results as unknown as Prisma.InputJsonValue,
          foundCount: found,
          averagePosition: found > 0 ? Math.round((posSum / found) * 10) / 10 : null,
        },
      }),
      // Coste total del run en una sola fila (suma de los N² puntos).
      prisma.apiUsageLog.create({
        data: {
          projectId: run.projectId,
          api: "dataforseo",
          endpoint: "modulo9.geogrid",
          model: null,
          costUsd: totalCost,
        },
      }),
    ]);

    return { processed: 1 };
  } catch (error) {
    const message =
      error instanceof DataForSeoSpendLimitError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Error desconocido";
    await prisma.geogridRun.update({
      where: { id: run.id },
      data: { status: "failed", completedAt: new Date(), errorMessage: message },
    });
    return { processed: 1 };
  }
}
