import { prisma } from "@/lib/db/prisma";
import { assertWithinSpendLimit } from "@/lib/dataforseo/spend";
import { checkSerpRank, normalizeDomain } from "@/lib/rank/serp";
import { madridDayBounds } from "@/lib/rank/day-guard";

// Comprueba la posición orgánica de una RankKeyword contra DataForSEO SERP y
// persiste el resultado: una nueva fila en RankPosition (histórico) + la
// actualización de lastPosition/bestPosition/lastCheckedAt + una fila de
// ApiUsageLog con el coste real. Una sola implementación del chequeo,
// compartida por el botón "comprobar ahora" (síncrono, UI), el cron
// (programado, job.ts) y la creación de keywords — sin duplicar lógica.
//
// >>> REGLA DE NEGOCIO: máximo un chequeo real por keyword y por día natural
// (Europe/Madrid). <<< El primer chequeo del día fija la posición y la
// deja inamovible hasta mañana: cualquier llamada posterior (manual o del
// cron) devuelve esa posición SIN llamar a la API ni crear fila nueva
// (gratis). Sin esto, pulsar "comprobar" varias veces en un día generaba
// varias RankPosition y la posición fluctuaba con cada SERP (Google
// personaliza/varía entre consultas) — no había estabilidad. Bloqueo
// estricto, sin override. Los fallos reales de API (excepción) sí permiten
// reintentar, porque en ese caso no llega a crearse RankPosition.
export async function checkRankKeyword(rankKeywordId: string): Promise<{
  position: number | null;
  projectId: string;
  keyword: string;
  locationCode: number;
  languageCode: string;
  device: string;
  // true = el chequeo NO se hizo contra la API: ya existía uno para hoy y se
  // ha devuelto la posición fijada. La UI lo usa para avisar en vez de
  // mostrar un cambio engañoso.
  fromCache: boolean;
  checkedAt?: string;
}> {
  const rk = await prisma.rankKeyword.findUnique({
    where: { id: rankKeywordId },
    include: { project: true },
  });
  if (!rk) throw new Error("Keyword de seguimiento no encontrada");
  if (!rk.project.domain) {
    throw new Error("El proyecto no tiene dominio configurado");
  }

  // Guard "un chequeo por día natural" (Europe/Madrid). Si hoy ya hay una
  // RankPosition (da igual su valor, incluido null = no posiciona), se
  // devuelve esa posición fijada sin gastar ni tocar el histórico. La query
  // aprovecha el índice @@index([rankKeywordId, checkedAt]).
  const { start, end } = madridDayBounds();
  const todays = await prisma.rankPosition.findFirst({
    where: { rankKeywordId: rk.id, checkedAt: { gte: start, lt: end } },
    orderBy: { checkedAt: "desc" },
  });
  if (todays) {
    return {
      position: todays.position,
      projectId: rk.projectId,
      keyword: rk.keyword,
      locationCode: rk.locationCode,
      languageCode: rk.languageCode,
      device: rk.device,
      fromCache: true,
      checkedAt: todays.checkedAt.toISOString(),
    };
  }

  // Tope de gasto: bloquea ANTES de la llamada (no gastar si ya estamos en el
  // límite mensual). Solo se evalúa para chequeos reales (los cacheados no
  // gastan).
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

  // Aprovecha el SERP recién pagado (y ya en SerpCache) para alimentar el
  // TF-IDF automáticamente: scraping del top-10 + cálculo + persistencia en
  // TfidfResult. Vive AQUÍ (no en cada route handler) para que TODO flujo que
  // chequea posición lo dispare de una sola vez: "comprobar ahora", "comprobar
  // todas", añadir keyword nueva, el cron diario y el "Lanzar análisis".
  // Fire-and-forget: no bloquea la respuesta al usuario (el scraping son 10
  // páginas y puede tardar varios segundos). El SERP ya está cacheado así que
  // es gratis — nunca se paga un segundo SERP para el TF-IDF.
  import("@/lib/tfidf/auto")
    .then(({ autoRunTfidf }) =>
      autoRunTfidf({
        projectId: rk.projectId,
        keyword: rk.keyword,
        locationCode: rk.locationCode,
        languageCode: rk.languageCode,
        device: rk.device,
      })
    )
    .catch((e) => console.error(`[rank→tfidf] keyword "${rk.keyword}":`, e));

  return {
    position: rank.position,
    projectId: rk.projectId,
    keyword: rk.keyword,
    locationCode: rk.locationCode,
    languageCode: rk.languageCode,
    device: rk.device,
    fromCache: false,
    checkedAt: now.toISOString(),
  };
}
