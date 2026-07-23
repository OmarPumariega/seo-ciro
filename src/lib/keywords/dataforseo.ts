// Cliente de DataForSEO (Módulo 1 — Keyword Research). Auth HTTP Basic con
// el login/password de la cuenta de la agencia. Se usan dos endpoints:
//
//   • Volumen/competición/CPC → keywords_data/google_ads/search_volume/live
//     (Keywords Data API; la mejor fuente para mirar un lote de keywords ya
//      conocidas, hasta 1000 por llamada plana).
//   • Intención de búsqueda  → dataforseo_labs/google/search_intent/live
//     (DataForSEO Labs; no acepta ubicación, solo idioma obligatorio).
//
// Principio del proyecto: nada se inventa. Toda métrica proviene de la
// respuesta real de DataForSEO; si la llamada falla se lanza DataForSeoError
// con el status_message real de la API, nunca un dato fabricado.

import {
  DataForSeoError,
  postTask,
} from "@/lib/dataforseo/client";

export { DataForSeoError };

export type Competition = "HIGH" | "MEDIUM" | "LOW";

export type KeywordVolume = {
  searchVolume: number | null;
  competition: Competition | null;
  cpc: number | null;
  // Estacionalidad (12 meses, orden cronológico ascendente). Llega gratis en
  // la misma respuesta de search_volume (campo monthly_searches); antes se
  // tiraba. Null si DataForSEO no la devuelve para esa keyword.
  monthlySearches: number[] | null;
};

// "informacional" | "mixta" | "transaccional" — el vocabulario de 3 buckets
// del proyecto (ver UI). Navigational y commercial (los dos labels intermedios
// de DataForSEO) se agrupan como "mixta".
export type IntentValue = "informacional" | "mixta" | "transaccional";

export type VolumeResult = {
  byKeyword: Map<string, KeywordVolume>;
  costUsd: number | null;
};

export type IntentResult = {
  byKeyword: Map<string, IntentValue | null>;
  costUsd: number | null;
};

function isCompetition(v: unknown): v is Competition {
  return v === "HIGH" || v === "MEDIUM" || v === "LOW";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Volumen de búsqueda + competición + CPC. `result` es un ARRAY con un
// elemento por keyword pedida (las que no tienen dato llegan con sus campos
// a null, no se omiten). Coste leído del campo real `tasks[0].cost`.
export async function fetchSearchVolume(
  keywords: string[],
  locationCode: number,
  languageCode: string
): Promise<VolumeResult> {
  const task = await postTask(
    "/v3/keywords_data/google_ads/search_volume/live",
    { keywords, location_code: locationCode, language_code: languageCode },
    "volumen"
  );

  const result = Array.isArray(task.result) ? (task.result as Array<Record<string, unknown>>) : [];
  const byKeyword = new Map<string, KeywordVolume>();

  for (const item of result) {
    const kw = typeof item.keyword === "string" ? item.keyword : null;
    if (!kw) continue;
    byKeyword.set(kw, {
      searchVolume: typeof item.search_volume === "number" ? item.search_volume : null,
      competition: isCompetition(item.competition) ? item.competition : null,
      cpc: typeof item.cpc === "number" ? round2(item.cpc) : null,
      monthlySearches: flattenMonthlySearches(item.monthly_searches),
    });
  }

  return { byKeyword, costUsd: typeof task.cost === "number" ? task.cost : null };
}

// Aplana monthly_searches (array de {year, month, searches}) a number[] ordenado
// cronológicamente (más antiguo → más reciente). Devuelve null si no viene.
// Exportado para reutilizarlo en suggestions.ts (mismo campo en keyword_info).
export function flattenMonthlySearches(
  ms: unknown
): number[] | null {
  if (!Array.isArray(ms) || ms.length === 0) return null;
  const sorted = [...ms]
    .filter(
      (m): m is { year: number; month: number; searches: number } =>
        !!m &&
        typeof (m as { year?: unknown }).year === "number" &&
        typeof (m as { month?: unknown }).month === "number" &&
        typeof (m as { searches?: unknown }).searches === "number"
    )
    .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
  if (sorted.length === 0) return null;
  return sorted.map((m) => m.searches);
}

// Intención de búsqueda. Aquí la estructura es más profunda:
// `tasks[0].result[0].items[i]`, y cada item trae `keyword_intent.label`
// (informational | navigational | commercial | transactional). El endpoint
// no admite ubicación, solo idioma (obligatorio).
export async function fetchSearchIntent(
  keywords: string[],
  languageCode: string
): Promise<IntentResult> {
  const task = await postTask(
    "/v3/dataforseo_labs/google/search_intent/live",
    { keywords, language_code: languageCode },
    "intención"
  );

  const resultArr = Array.isArray(task.result) ? (task.result as Array<Record<string, unknown>>) : [];
  const resultObj = resultArr[0] ?? {};
  const items = Array.isArray(resultObj.items) ? (resultObj.items as Array<Record<string, unknown>>) : [];
  const byKeyword = new Map<string, IntentValue | null>();

  for (const item of items) {
    const kw = typeof item.keyword === "string" ? item.keyword : null;
    if (!kw) continue;
    const intentObj = item.keyword_intent as { label?: string } | undefined;
    byKeyword.set(kw, mapIntent(intentObj?.label));
  }

  return { byKeyword, costUsd: typeof task.cost === "number" ? task.cost : null };
}

// Mapea los 4 labels de DataForSEO al vocabulario de 3 buckets del proyecto.
// Navigational y commercial son ambos "intermedios" → se agrupan como mixta.
export function mapIntent(label: string | undefined): IntentValue | null {
  switch (label) {
    case "informational":
      return "informacional";
    case "transactional":
      return "transaccional";
    case "navigational":
    case "commercial":
      return "mixta";
    default:
      return null;
  }
}
