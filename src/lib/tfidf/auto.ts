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
// Se llama fire-and-forget desde la ruta de check manual de rank tracking (no
// desde el cron, para no saturar con scraping en lotes programados).
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
  if (results.length === 0) return;

  // 2) Scrapea + calcula TF-IDF, temas, encabezados por página y freq de palabras.
  const tfidfResult = await computeTfidf(results);
  if (tfidfResult.sources.length === 0) return;

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
