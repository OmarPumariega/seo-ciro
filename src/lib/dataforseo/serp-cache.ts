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

export type CachedSerpItem = { url: string; title: string; domain: string };

export async function getCachedSerp(params: {
  keyword: string;
  locationCode: number;
  languageCode: string;
  device: string;
}): Promise<CachedSerpItem[] | null> {
  const cutoff = new Date(Date.now() - TTL_MS);
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
  return row.results as unknown as CachedSerpItem[];
}

export async function saveSerpCache(params: {
  keyword: string;
  locationCode: number;
  languageCode: string;
  device: string;
  results: CachedSerpItem[];
}): Promise<void> {
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
      fetchedAt: new Date(),
    },
    update: {
      results: params.results as unknown as Prisma.InputJsonValue,
      fetchedAt: new Date(),
    },
  });
}
