import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

// Caché de SERP orgánico compartida entre rank tracking (escritor) y TF-IDF
// (lector). Evita pagar dos veces por el mismo SERP: cuando el rank tracking
// chequea una keyword, guarda el top-10 orgánico aquí; el TF-IDF, si la keyword
// ya se sigue, lo lee gratis en vez de pedir otro SERP.
//
// TTL 7 días: el top-10 de URLs cambia despacio, suficiente para optimizar
// sin servir datos rancios.

const TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CachedSerpItem = {
  url: string;
  title: string;
  domain: string;
  // Posición absoluta en el SERP (rank_absolute). Se guarda para que el TF-IDF
  // pueda mostrar el top-10 ordenado y la UI lo respete sin reconstruirlo.
  position?: number;
  // Snippet con el que Google muestra el resultado (campo `description` del
  // item orgánico). Dato de copy muy reutilizable: ejemplo de cómo posiciona
  // el competidor, base para títulos/metas. Antes se descartaba pese a venir
  // gratis en la misma respuesta que ya pagábamos.
  description?: string;
};

// Funcionalidades del SERP más allá de los orgánicos — misma respuesta ya
// pagada, antes ni se inspeccionaban (solo se miraban items type:"organic").
export type PeopleAlsoAskItem = { question: string };
export type FeaturedSnippet = { title: string | null; url: string | null; description: string | null };

export type CachedSerpExtras = {
  peopleAlsoAsk: PeopleAlsoAskItem[] | null;
  relatedSearches: string[] | null;
  featuredSnippet: FeaturedSnippet | null;
};

export type CachedSerpEntry = CachedSerpExtras & { results: CachedSerpItem[] };

// Parsea las funcionalidades del SERP (PAA/related searches/featured snippet)
// de la lista cruda de items de una respuesta de
// serp/google/organic/live/advanced — compartido entre rank/serp.ts (Módulo 5)
// y tfidf/serp.ts, que llaman al mismo endpoint por caminos distintos (uno
// siempre pide, el otro solo si no hay caché).
export function parseSerpExtras(items: Array<Record<string, unknown>>): CachedSerpExtras {
  const paaRaw = items.find((it) => it.type === "people_also_ask");
  const paaSubItems = Array.isArray(paaRaw?.items) ? (paaRaw!.items as Array<Record<string, unknown>>) : [];
  const peopleAlsoAsk = paaSubItems
    .map((it) => (typeof it.title === "string" ? it.title : typeof it.question === "string" ? it.question : null))
    .filter((q): q is string => Boolean(q))
    .map((question) => ({ question }));

  const relatedRaw = items.find((it) => it.type === "related_searches");
  const relatedRawItems = Array.isArray(relatedRaw?.items) ? (relatedRaw!.items as unknown[]) : [];
  const relatedSearches = relatedRawItems.filter((it): it is string => typeof it === "string");

  const snippetRaw = items.find((it) => it.type === "featured_snippet");
  const featuredSnippet: FeaturedSnippet | null = snippetRaw
    ? {
        title: typeof snippetRaw.title === "string" ? snippetRaw.title : null,
        url: typeof snippetRaw.url === "string" ? snippetRaw.url : null,
        description: typeof snippetRaw.description === "string" ? snippetRaw.description : null,
      }
    : null;

  return {
    peopleAlsoAsk: peopleAlsoAsk.length > 0 ? peopleAlsoAsk : null,
    relatedSearches: relatedSearches.length > 0 ? relatedSearches : null,
    featuredSnippet,
  };
}

export async function getCachedSerp(params: {
  keyword: string;
  locationCode: number;
  languageCode: string;
  device: string;
  freshAfter?: Date;
}): Promise<CachedSerpItem[] | null> {
  const row = await getCachedSerpEntry(params);
  return row?.results ?? null;
}

// Igual que getCachedSerp pero devolviendo también las funcionalidades del
// SERP (PAA/related searches/featured snippet) — para TF-IDF y Rank Tracking.
// `freshAfter` permite a un caller exigir un corte más estricto que el TTL de
// 7 días por defecto (p.ej. Rank Tracking solo acepta caché de HOY, no de
// hace días, aunque siga "fresco" para TF-IDF).
export async function getCachedSerpEntry(params: {
  keyword: string;
  locationCode: number;
  languageCode: string;
  device: string;
  freshAfter?: Date;
}): Promise<CachedSerpEntry | null> {
  const cutoff = params.freshAfter ?? new Date(Date.now() - TTL_MS);
  const row = await prisma.serpCache.findFirst({
    where: {
      keyword: params.keyword,
      locationCode: params.locationCode,
      languageCode: params.languageCode,
      device: params.device,
      fetchedAt: { gt: cutoff },
    },
    orderBy: { fetchedAt: "desc" },
  });
  if (!row) return null;
  return {
    results: row.results as unknown as CachedSerpItem[],
    peopleAlsoAsk: (row.peopleAlsoAsk as unknown as PeopleAlsoAskItem[] | null) ?? null,
    relatedSearches: (row.relatedSearches as unknown as string[] | null) ?? null,
    featuredSnippet: (row.featuredSnippet as unknown as FeaturedSnippet | null) ?? null,
  };
}

export async function saveSerpCache(params: {
  keyword: string;
  locationCode: number;
  languageCode: string;
  device: string;
  results: CachedSerpItem[];
  peopleAlsoAsk?: PeopleAlsoAskItem[] | null;
  relatedSearches?: string[] | null;
  featuredSnippet?: FeaturedSnippet | null;
}): Promise<void> {
  const extras = {
    peopleAlsoAsk: params.peopleAlsoAsk ?? null,
    relatedSearches: params.relatedSearches ?? null,
    featuredSnippet: params.featuredSnippet ?? null,
  } as unknown as {
    peopleAlsoAsk: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    relatedSearches: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    featuredSnippet: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  };
  await prisma.serpCache.upsert({
    where: {
      keyword_locationCode_languageCode_device: {
        keyword: params.keyword,
        locationCode: params.locationCode,
        languageCode: params.languageCode,
        device: params.device,
      },
    },
    create: {
      keyword: params.keyword,
      locationCode: params.locationCode,
      languageCode: params.languageCode,
      device: params.device,
      results: params.results as unknown as Prisma.InputJsonValue,
      ...extras,
      fetchedAt: new Date(),
    },
    update: {
      results: params.results as unknown as Prisma.InputJsonValue,
      ...extras,
      fetchedAt: new Date(),
    },
  });
}
