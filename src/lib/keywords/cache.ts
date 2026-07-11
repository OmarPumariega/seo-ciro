import { prisma } from "@/lib/db/prisma";

// Caché de resultados de DataForSEO (sección 5 del spec: "evitar pagar dos
// veces por el mismo dato"). Clave por (keyword, idioma, ubicación), no por
// proyecto/estudio — el volumen de una keyword es un dato objetivo de SERP,
// independiente de qué cliente la pidió. 30 días de frescura antes de volver
// a pagar por ella.

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type CachedRow = {
  searchVolume: number | null;
  competition: string | null;
  cpc: number | null;
  intent: string | null;
};

type Datum = {
  searchVolume: number | null;
  competition: string | null;
  cpc: number | null;
  intent: string | null;
};

// Devuelve solo las keywords pedidas que tengan una fila fresca (< 30 días).
// Las que no existan o estén caducadas simplemente no aparecen en el mapa.
export async function getFreshCache(
  keywords: string[],
  languageCode: string,
  locationCode: number
): Promise<Map<string, CachedRow>> {
  const cutoff = new Date(Date.now() - CACHE_TTL_MS);
  const rows = await prisma.keywordDataCache.findMany({
    where: {
      keyword: { in: keywords },
      languageCode,
      locationCode,
      fetchedAt: { gt: cutoff },
    },
  });

  const map = new Map<string, CachedRow>();
  for (const row of rows) {
    map.set(row.keyword, {
      searchVolume: row.searchVolume,
      competition: row.competition,
      cpc: row.cpc ? Number(row.cpc) : null,
      intent: row.intent,
    });
  }
  return map;
}

// Upsert por keyword pendiente. La clave única compuesta
// (keyword, languageCode, locationCode) hace que re-estudiar una keyword
// fuera de ventana simplemente refresque su fila en sitio.
export async function upsertCache(
  keywords: string[],
  data: Map<string, Datum>,
  languageCode: string,
  locationCode: number
): Promise<void> {
  await Promise.all(
    keywords.map((kw) => {
      const d = data.get(kw);
      if (!d) return Promise.resolve();
      return prisma.keywordDataCache.upsert({
        where: {
          keyword_languageCode_locationCode: {
            keyword: kw,
            languageCode,
            locationCode,
          },
        },
        create: {
          keyword: kw,
          languageCode,
          locationCode,
          searchVolume: d.searchVolume,
          competition: d.competition,
          cpc: d.cpc,
          intent: d.intent,
          fetchedAt: new Date(),
        },
        update: {
          searchVolume: d.searchVolume,
          competition: d.competition,
          cpc: d.cpc,
          intent: d.intent,
          fetchedAt: new Date(),
        },
      });
    })
  );
}
