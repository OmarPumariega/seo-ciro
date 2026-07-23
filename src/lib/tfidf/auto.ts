import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { fetchTopOrganic } from "@/lib/tfidf/serp";
import { computeTfidf } from "@/lib/tfidf/tfidf";
import { normalizeKeyword } from "@/lib/keywords/normalize";

// Auto-ejecuta el análisis TF-IDF aprovechando el SERP que ya pagó el rank
// tracking. Si la keyword está en SerpCache (chequeo reciente), el SERP sale
// GRATIS — solo se paga el scraping (gratis, sin API). El resultado se persiste
// en TfidfResult (upsert por project+keyword) para que el módulo TF-IDF lo
// muestre sin que el usuario tenga que ir a ejecutarlo.
//
// Se invoca desde dentro de checkRankKeyword (fire-and-forget) en CADA chequeo
// real de posición — manual ("comprobar ahora"/"comprobar todas"), al añadir
// keyword nueva y desde el cron diario. Antes vivía solo en el handler de
// /check (no en el cron); ahora cubre todos los flujos y mantiene el TF-IDF
// fresco sin acción manual. Con el guard de "un chequeo por día", el scraping
// del top-10 solo ocurre una vez por keyword y por día.
export async function autoRunTfidf(params: {
  projectId: string;
  keyword: string;
  locationCode: number;
  languageCode: string;
  device: string;
}): Promise<void> {
  const { projectId, keyword, locationCode, languageCode, device } = params;

  // 1) Top-10 orgánico (de caché si el rank tracking ya lo pagó).
  const { results, costUsd } = await fetchTopOrganic({
    keyword,
    locationCode,
    languageCode,
    device,
  });
  if (results.length === 0) {
    console.warn(`[tfidf] "${keyword}": SERP sin resultados orgánicos, nada que analizar`);
    return;
  }

  // 2) Scrapea + calcula TF-IDF, temas, encabezados por página y freq de palabras.
  const tfidfResult = await computeTfidf(results);
  if (tfidfResult.sources.length === 0) {
    console.warn(
      `[tfidf] "${keyword}": no se pudo scrapear ninguna de las ${results.length} URLs del top-10 (anti-bot/timeouts)`
    );
    return;
  }

  // 3) Persiste (upsert por project+keyword normalizada).
  const normalized = normalizeKeyword(keyword);
  await prisma.tfidfResult.upsert({
    where: { projectId_keyword: { projectId, keyword: normalized } },
    create: {
      projectId,
      keyword: normalized,
      result: tfidfResult as unknown as Prisma.InputJsonValue,
    },
    update: {
      result: tfidfResult as unknown as Prisma.InputJsonValue,
    },
  });

  // 4) Registra coste si hubo SERP nuevo (el scraping es gratis).
  if (costUsd !== null) {
    await prisma.apiUsageLog.create({
      data: {
        projectId,
        api: "dataforseo",
        endpoint: "tfidf",
        model: null,
        costUsd,
      },
    });
  }
}
