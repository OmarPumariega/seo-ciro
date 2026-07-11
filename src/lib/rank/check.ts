import { prisma } from "@/lib/db/prisma";
import { checkSerpRank, normalizeDomain } from "@/lib/rank/serp";

// Comprueba la posición orgánica de una RankKeyword contra DataForSEO SERP y
// persiste el resultado: una nueva fila en RankPosition (histórico) + la
// actualización de lastPosition/bestPosition/lastCheckedAt + una fila de
// ApiUsageLog con el coste real. Una sola implementación del chequeo,
// compartida por el botón "comprobar ahora" (síncrono, UI) y por el cron
// (programado, job.ts) — sin duplicar lógica.
export async function checkRankKeyword(rankKeywordId: string): Promise<{ position: number | null }> {
  const rk = await prisma.rankKeyword.findUnique({
    where: { id: rankKeywordId },
    include: { project: true },
  });
  if (!rk) throw new Error("Keyword de seguimiento no encontrada");
  if (!rk.project.domain) {
    throw new Error("El proyecto no tiene dominio configurado");
  }

  const projectDomain = normalizeDomain(rk.project.domain);

  const { rank, costUsd } = await checkSerpRank({
    keyword: rk.keyword,
    locationCode: rk.locationCode,
    languageCode: rk.languageCode,
    device: rk.device,
    projectDomain,
  });

  const now = new Date();
  await prisma.$transaction([
    prisma.rankPosition.create({
      data: {
        rankKeywordId: rk.id,
        checkedAt: now,
        position: rank.position,
        url: rank.url,
      },
    }),
    prisma.rankKeyword.update({
      where: { id: rk.id },
      data: {
        lastPosition: rank.position,
        lastCheckedAt: now,
        // bestPosition solo mejora (baja) cuando hay posición real; un
        // "fuera del top-100" no empeora el histórico de mejor.
        bestPosition:
          rank.position !== null
            ? rk.bestPosition === null
              ? rank.position
              : Math.min(rk.bestPosition, rank.position)
            : rk.bestPosition,
      },
    }),
  ]);

  if (costUsd !== null) {
    await prisma.apiUsageLog.create({
      data: {
        projectId: rk.projectId,
        api: "dataforseo",
        endpoint: "modulo5.rankcheck",
        model: null,
        costUsd,
      },
    });
  }

  return { position: rank.position };
}
