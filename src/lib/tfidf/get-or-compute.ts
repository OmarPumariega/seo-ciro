import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { DataForSeoError } from "@/lib/dataforseo/client";
import { assertWithinSpendLimit, DataForSeoSpendLimitError } from "@/lib/dataforseo/spend";
import { fetchTopOrganic } from "@/lib/tfidf/serp";
import { computeTfidf, type TfidfResult as ComputedTfidfResult } from "@/lib/tfidf/tfidf";
import { normalizeKeyword } from "@/lib/keywords/normalize";
import type { PeopleAlsoAskItem, FeaturedSnippet } from "@/lib/dataforseo/serp-cache";

// Lógica de "reusa lo ya guardado o calcúlalo" del módulo TF-IDF, extraída de
// src/app/api/proyectos/[id]/tfidf/route.ts para que otros flujos (Contenido
// → "Optimizar URL existente") puedan reutilizarla sin duplicar el spend-guard
// + fetch SERP + cálculo + upsert. La ruta de TF-IDF pasa a llamar a esta
// misma función — mismo comportamiento, un solo sitio si cambia.

export class TfidfNoResultsError extends Error {}

export type StoredTfidfResult = ComputedTfidfResult & {
  peopleAlsoAsk: PeopleAlsoAskItem[] | null;
  relatedSearches: string[] | null;
  featuredSnippet: FeaturedSnippet | null;
};

export async function getOrComputeTfidfResult(params: {
  projectId: string;
  keyword: string;
  languageCode?: string;
  locationCode?: number;
}): Promise<{ result: StoredTfidfResult; costUsd: number | null; fromCache: boolean }> {
  const { projectId, keyword } = params;
  const languageCode = params.languageCode ?? "es";
  const locationCode = params.locationCode ?? 2724;
  const normalized = normalizeKeyword(keyword);

  const stored = await prisma.tfidfResult.findUnique({
    where: { projectId_keyword: { projectId, keyword: normalized } },
  });
  if (stored) {
    return { result: stored.result as unknown as StoredTfidfResult, costUsd: null, fromCache: true };
  }

  await assertWithinSpendLimit(projectId); // lanza DataForSeoSpendLimitError si aplica

  // Usa la keyword NORMALIZADA (igual que RankKeyword.keyword) para que el
  // lookup de SerpCache haga match aunque el usuario la haya escrito con
  // mayúsculas/espaciado distinto — si no, un caché ya pagado por Rank
  // Tracking no se encontraría por una comparación de string exacta.
  const serp = await fetchTopOrganic({ keyword: normalized, locationCode, languageCode }); // lanza DataForSeoError si aplica
  if (serp.results.length === 0) {
    throw new TfidfNoResultsError("La búsqueda no devolvió resultados orgánicos para esta keyword.");
  }

  const result: StoredTfidfResult = {
    ...(await computeTfidf(serp.results)),
    peopleAlsoAsk: serp.peopleAlsoAsk,
    relatedSearches: serp.relatedSearches,
    featuredSnippet: serp.featuredSnippet,
  };

  await prisma.tfidfResult.upsert({
    where: { projectId_keyword: { projectId, keyword: normalized } },
    create: { projectId, keyword: normalized, result: result as unknown as Prisma.InputJsonValue },
    update: { result: result as unknown as Prisma.InputJsonValue },
  });

  if (serp.costUsd !== null) {
    await prisma.apiUsageLog.create({
      data: { projectId, api: "dataforseo", endpoint: "tfidf", model: null, costUsd: serp.costUsd },
    });
  }

  return { result, costUsd: serp.costUsd, fromCache: false };
}

export { DataForSeoError, DataForSeoSpendLimitError };
