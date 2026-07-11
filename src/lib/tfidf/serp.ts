import { postTask, DataForSeoError } from "@/lib/dataforseo/client";

// Obtiene las top URLs orgánicas de Google para una keyword, vía el mismo
// endpoint Live Advanced que usa el Módulo 5 (rank tracking). Aquí no buscamos
// la posición del dominio del proyecto, sino el corpus de páginas que Google
// considera más relevantes para la keyword: son las que scrapearemos después
// para calcular TF-IDF y descubrir qué términos comparten.
//
// depth fijo a 10: con el top-10 basta para construir un corpus representativo
// sin disparar el coste (1 bloque de resultado, ~0,002$).

export type SerpTopResult = {
  url: string;
  title: string;
};

export type SerpTopOutcome = {
  results: SerpTopResult[];
  costUsd: number | null;
};

type OrganicItem = {
  type?: string;
  url?: string;
  title?: string;
};

export async function fetchTopOrganic(params: {
  keyword: string;
  locationCode: number;
  languageCode: string;
}): Promise<SerpTopOutcome> {
  const { keyword, locationCode, languageCode } = params;

  const task = await postTask(
    "/v3/serp/google/organic/live/advanced",
    {
      keyword,
      location_code: locationCode,
      language_code: languageCode,
      depth: 10,
    },
    "tfidf"
  );

  const resultArr = Array.isArray(task.result)
    ? (task.result as Array<Record<string, unknown>>)
    : [];
  const resultObj = resultArr[0] ?? {};
  const items = Array.isArray(resultObj.items)
    ? (resultObj.items as Array<Record<string, unknown>>)
    : [];

  const results: SerpTopResult[] = [];
  for (const raw of items) {
    const item = raw as OrganicItem;
    if (item.type !== "organic") continue;
    const url = typeof item.url === "string" ? item.url : "";
    const title = typeof item.title === "string" ? item.title : "";
    if (!url) continue;
    results.push({ url, title });
  }

  return {
    results,
    costUsd: typeof task.cost === "number" ? task.cost : null,
  };
}

export { DataForSeoError };
