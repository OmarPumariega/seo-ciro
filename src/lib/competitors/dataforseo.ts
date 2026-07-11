import { postTask } from "@/lib/dataforseo/client";
import { normalizeDomain } from "@/lib/rank/serp";

// Espionaje de competidores (Tier 2). Tres endpoints de DataForSEO Labs:
//   • domain_rank_overview → visibilidad (tráfico orgánico estimado + nº keywords)
//   • ranked_keywords      → keywords por las que un dominio rankea (+ posición/volumen)
//   • domain_intersection  → content gap (keywords que rankea un dominio y otro no)
//
// Mismo principio que el resto: nada se inventa, todo viene de la respuesta
// real; el coste (tasks[0].cost) se devuelve para registrarlo en ApiUsageLog.

export type DomainOverview = {
  organicTraffic: number | null; // metrics.organic.etv
  organicKeywords: number | null; // metrics.organic.count
};

export type RankedKeyword = {
  keyword: string;
  position: number | null; // rank_absolute del dominio para esa keyword
  volume: number | null; // search_volume
};

// Visibilidad de un dominio: tráfico orgánico estimado mensual (etv) y nº de
// keywords orgánicas (count). Datos en tasks[0].result[0].items[0].metrics.organic.
export async function fetchDomainOverview(params: {
  domain: string;
  locationCode: number;
  languageCode: string;
}): Promise<DomainOverview & { costUsd: number | null }> {
  const task = await postTask(
    "/v3/dataforseo_labs/google/domain_rank_overview/live",
    { target: params.domain, location_code: params.locationCode, language_code: params.languageCode },
    "visibilidad"
  );
  const resultArr = Array.isArray(task.result) ? (task.result as Array<Record<string, unknown>>) : [];
  const item = Array.isArray(resultArr[0]?.items) ? (resultArr[0]!.items as Array<Record<string, unknown>>)[0] : null;
  const organic = (item?.metrics as Record<string, unknown> | undefined)?.organic as
    | { etv?: number; count?: number }
    | undefined;
  return {
    organicTraffic: typeof organic?.etv === "number" ? organic.etv : null,
    organicKeywords: typeof organic?.count === "number" ? organic.count : null,
    costUsd: typeof task.cost === "number" ? task.cost : null,
  };
}

// Top keywords por las que rankea un dominio, con posición y volumen.
export async function fetchRankedKeywords(params: {
  domain: string;
  locationCode: number;
  languageCode: string;
  limit: number;
}): Promise<{ items: RankedKeyword[]; costUsd: number | null }> {
  const task = await postTask(
    "/v3/dataforseo_labs/google/ranked_keywords/live",
    {
      target: params.domain,
      location_code: params.locationCode,
      language_code: params.languageCode,
      item_types: ["organic"],
      limit: params.limit,
    },
    "ranked_keywords"
  );
  const resultArr = Array.isArray(task.result) ? (task.result as Array<Record<string, unknown>>) : [];
  const items = Array.isArray(resultArr[0]?.items) ? (resultArr[0]!.items as Array<Record<string, unknown>>) : [];
  const ranked: RankedKeyword[] = [];
  for (const raw of items) {
    const kd = raw.keyword_data as Record<string, unknown> | undefined;
    const ki = kd?.keyword_info as Record<string, unknown> | undefined;
    const serp = (raw.ranked_serp_element as Record<string, unknown> | undefined)?.serp_item as
      | Record<string, unknown>
      | undefined;
    const keyword = typeof kd?.keyword === "string" ? kd.keyword : null;
    if (!keyword) continue;
    ranked.push({
      keyword,
      position: typeof serp?.rank_absolute === "number" ? serp.rank_absolute : null,
      volume: typeof ki?.search_volume === "number" ? ki.search_volume : null,
    });
  }
  return { items: ranked, costUsd: typeof task.cost === "number" ? task.cost : null };
}

// Content gap: keywords por las que `competitorDomain` rankea y `projectDomain`
// NO. domain_intersection con intersections:false (target1=competidor,
// target2=proyecto) → solo keywords del competidor que el proyecto no tiene.
export async function fetchContentGap(params: {
  competitorDomain: string;
  projectDomain: string;
  locationCode: number;
  languageCode: string;
  limit: number;
}): Promise<{ items: RankedKeyword[]; costUsd: number | null }> {
  const task = await postTask(
    "/v3/dataforseo_labs/google/domain_intersection/live",
    {
      target1: params.competitorDomain,
      target2: params.projectDomain,
      location_code: params.locationCode,
      language_code: params.languageCode,
      intersections: false,
      item_types: ["organic"],
      order_by: ["keyword_data.keyword_info.search_volume,desc"],
      limit: params.limit,
    },
    "content_gap"
  );
  const resultArr = Array.isArray(task.result) ? (task.result as Array<Record<string, unknown>>) : [];
  const items = Array.isArray(resultArr[0]?.items) ? (resultArr[0]!.items as Array<Record<string, unknown>>) : [];
  const gap: RankedKeyword[] = [];
  for (const raw of items) {
    const kd = raw.keyword_data as Record<string, unknown> | undefined;
    const ki = kd?.keyword_info as Record<string, unknown> | undefined;
    const first = raw.first_domain_serp_element as Record<string, unknown> | undefined;
    const keyword = typeof kd?.keyword === "string" ? kd.keyword : null;
    if (!keyword) continue;
    gap.push({
      keyword,
      position: typeof first?.rank_absolute === "number" ? first.rank_absolute : null,
      volume: typeof ki?.search_volume === "number" ? ki.search_volume : null,
    });
  }
  return { items: gap, costUsd: typeof task.cost === "number" ? task.cost : null };
}

export { normalizeDomain };
