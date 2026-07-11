import { postTask, DataForSeoError } from "@/lib/dataforseo/client";
import { getCachedSerp, saveSerpCache } from "@/lib/dataforseo/serp-cache";

// Obtiene las top URLs orgánicas de Google para una keyword, vía el mismo
// endpoint Live Advanced que usa el Módulo 5 (rank tracking). Aquí no buscamos
// la posición del dominio del proyecto, sino el corpus de páginas que Google
// considera más relevantes para la keyword: son las que scrapearemos después
// para calcular TF-IDF y descubrir qué términos comparten.
//
// Antes de pagar: revisa la caché de SERP — si rank tracking ya chequeó esta
// keyword (mismo idioma/ubicación/desktop), reusa su top-10 GRATIS. Solo si no
// hay caché fresca (7 días) pide un SERP nuevo y lo guarda para la próxima.

export type SerpTopResult = {
  url: string;
  title: string;
};

export type SerpTopOutcome = {
  results: SerpTopResult[];
  costUsd: number | null; // null = servido desde caché (gratis)
};

type OrganicItem = {
  type?: string;
  url?: string;
  title?: string;
  domain?: string;
};

export async function fetchTopOrganic(params: {
  keyword: string;
  locationCode: number;
  languageCode: string;
}): Promise<SerpTopOutcome> {
  const { keyword, locationCode, languageCode } = params;
  const device = "desktop"; // TF-IDF no distingue device; usa desktop como el rank por defecto

  // 1) ¿Está en caché? (rank tracking ya pagó este SERP)
  const cached = await getCachedSerp({ keyword, locationCode, languageCode, device });
  if (cached && cached.length > 0) {
    return {
      results: cached.map((c) => ({ url: c.url, title: c.title })),
      costUsd: null, // gratis — reutilizado del rank tracking
    };
  }

  // 2) No en caché → pedir y guardar.
  const task = await postTask(
    "/v3/serp/google/organic/live/advanced",
    { keyword, location_code: locationCode, language_code: languageCode, device, depth: 10 },
    "tfidf"
  );

  const resultArr = Array.isArray(task.result) ? (task.result as Array<Record<string, unknown>>) : [];
  const resultObj = resultArr[0] ?? {};
  const items = Array.isArray(resultObj.items) ? (resultObj.items as Array<Record<string, unknown>>) : [];

  const results: SerpTopResult[] = [];
  const forCache: { url: string; title: string; domain: string }[] = [];
  for (const raw of items) {
    const item = raw as OrganicItem;
    if (item.type !== "organic") continue;
    const url = typeof item.url === "string" ? item.url : "";
    const title = typeof item.title === "string" ? item.title : "";
    if (!url) continue;
    results.push({ url, title });
    forCache.push({ url, title, domain: typeof item.domain === "string" ? item.domain : "" });
    if (forCache.length >= 10) break;
  }

  if (forCache.length > 0) {
    saveSerpCache({ keyword, locationCode, languageCode, device, results: forCache }).catch(() => {});
  }

  return { results, costUsd: typeof task.cost === "number" ? task.cost : null };
}

export { DataForSeoError };
