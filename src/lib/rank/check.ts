import { prisma } from "@/lib/db/prisma";
import { assertWithinSpendLimit } from "@/lib/dataforseo/spend";
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

  // Tope de gasto: bloquea ANTES de la llamada (no gastar si ya estamos en el
  // límite mensual). Las posiciones cacheadas no aplican aquí (SERP no cachea).
  await assertWithinSpendLimit(rk.projectId);

  const projectDomain = normalizeDomain(rk.project.domain);

  // Competidores trackeados del proyecto (módulo Competidores) — se
  // localizan en el MISMO SERP que ya se paga para la keyword propia, coste
  // marginal cero. No es una llamada nueva, solo se deja de descartar dato
  // que ya venía en la respuesta.
  const competitors = await prisma.competitor.findMany({
    where: { projectId: rk.projectId },
    select: { domain: true },
  });

  const { rank, costUsd, competitors: competitorRanks } = await checkSerpRank({
    keyword: rk.keyword,
    locationCode: rk.locationCode,
    languageCode: rk.languageCode,
    device: rk.device,
    projectDomain,
    depth: rk.depth,
    competitorDomains: competitors.map((c) => c.domain),
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
    ...(competitors.length > 0
      ? [
          prisma.rankCompetitorPosition.createMany({
            data: competitors.map((c) => ({
              rankKeywordId: rk.id,
              competitorDomain: c.domain,
              checkedAt: now,
              position: competitorRanks[c.domain]?.position ?? null,
              url: competitorRanks[c.domain]?.url ?? null,
            })),
          }),
        ]
      : []),
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
