import { postTask } from "@/lib/dataforseo/client";
import { mapIntent, type IntentValue, type Competition } from "@/lib/keywords/dataforseo";
import { upsertCache } from "@/lib/keywords/cache";

// Sugerencias de keywords (Módulo 1, modo Planificador). A partir de una
// keyword semilla, DataForSEO Labs devuelve keywords relacionadas con sus
// métricas completas ya incluidas (keyword_info + search_intent_info), así que
// aquí NO hace falta llamar aparte a volumen ni a intención — vienen en cada
// item. Las métricas se cachean en KeywordDataCache al traerlas, de modo que
// añadir una sugerencia al estudio después sea instantáneo y gratis (cache hit).

export type Suggestion = {
  keyword: string;
  searchVolume: number | null;
  competition: Competition | null;
  cpc: number | null;
  intent: IntentValue | null;
};

function isLevel(v: unknown): v is Competition {
  return v === "HIGH" || v === "MEDIUM" || v === "LOW";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function fetchSuggestions(params: {
  seed: string;
  locationCode: number;
  languageCode: string;
  limit: number;
}): Promise<{ items: Suggestion[]; costUsd: number | null }> {
  const { seed, locationCode, languageCode, limit } = params;

  const task = await postTask(
    "/v3/dataforseo_labs/google/keyword_suggestions/live",
    { keyword: seed, location_code: locationCode, language_code: languageCode, limit },
    "sugerencias"
  );

  const resultArr = Array.isArray(task.result) ? (task.result as Array<Record<string, unknown>>) : [];
  const rawItems = Array.isArray(resultArr[0]?.items) ? (resultArr[0]!.items as Array<Record<string, unknown>>) : [];

  const items: Suggestion[] = [];
  const cacheData = new Map<string, { searchVolume: number | null; competition: string | null; cpc: number | null; intent: string | null }>();

  for (const item of rawItems) {
    const kw = typeof item.keyword === "string" ? item.keyword : null;
    if (!kw) continue;
    const ki = (item.keyword_info ?? {}) as Record<string, unknown>;
    const si = (item.search_intent_info ?? {}) as Record<string, unknown>;
    const intent = mapIntent(typeof si.main_intent === "string" ? si.main_intent : undefined);
    const suggestion: Suggestion = {
      keyword: kw,
      searchVolume: typeof ki.search_volume === "number" ? ki.search_volume : null,
      competition: isLevel(ki.competition_level) ? ki.competition_level : null,
      cpc: typeof ki.cpc === "number" ? round2(ki.cpc) : null,
      intent,
    };
    items.push(suggestion);
    cacheData.set(kw, {
      searchVolume: suggestion.searchVolume,
      competition: suggestion.competition,
      cpc: suggestion.cpc,
      intent,
    });
  }

  // Calienta el caché: al añadir estas keywords al estudio después, serán
  // cache hit (gratis) y consistente con lo que vio el usuario en sugerencias.
  if (items.length > 0) {
    await upsertCache(
      items.map((i) => i.keyword),
      cacheData,
      languageCode,
      locationCode
    );
  }

  return { items, costUsd: typeof task.cost === "number" ? task.cost : null };
}
