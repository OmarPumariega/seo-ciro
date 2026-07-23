import { postTask } from "@/lib/dataforseo/client";
import { normalizeDomain } from "@/lib/rank/serp";

// Espionaje de competidores (Tier 2). Tres endpoints de DataForSEO Labs:
//   • domain_rank_overview → visibilidad (tráfico orgánico estimado + nº keywords
//     + distribución de posiciones top3/10/100 + posición media)
//   • ranked_keywords      → keywords por las que un dominio rankea (+ posición,
//     volumen, CPC, dificultad y la URL + snippet con el que posiciona)
//   • domain_intersection  → content gap (mismo detalle por keyword)
//
// Mismo principio que el resto: nada se inventa, todo viene de la respuesta
// real. El coste (tasks[0].cost) se devuelve para registrarlo en ApiUsageLog.
//
// >>> APROVECHAR CADA CÉNTIMO <<<: DataForSEO Labs cobra por ÍTEM DEVUELTO, no
// por `limit` pedido, y cada ítem ya viene con keyword_info COMPLETA
// (competition, cpc, monthly_searches) y con el serp_element (title, url,
// description). Antes se extraían solo 3 campos y se tiraba el resto; ahora se
// persiste todo — es dato que ya habíamos pagado.

export type RankedKeyword = {
  keyword: string;
  position: number | null; // rank_absolute del dominio para esa keyword
  volume: number | null; // search_volume
  // --- Campos que ya venían gratis y antes se descartaban ---
  competition: string | null; // "HIGH" | "MEDIUM" | "LOW"
  competitionIndex: number | null; // 0-100 (más granular que `competition`)
  cpc: number | null; // coste por clic estimado (USD)
  monthlySearches: number[] | null; // 12 meses (estacionalidad), orden cronológico
  title: string | null; // title de la URL que posiciona el dominio
  url: string | null; // URL exacta que rankea
  description: string | null; // snippet de Google (cómo se muestra)
};

export type PositionBuckets = {
  top3: number; // pos_1 + pos_2_3
  top10: number; // pos_4_10
  top100: number; // resto (pos_11_20 ... pos_91_100)
};

export type DomainOverview = {
  organicTraffic: number | null; // metrics.organic.etv
  organicKeywords: number | null; // metrics.organic.count
  // --- Campos que ya venían gratis y antes se descartaban ---
  // Distribución de las keywords del dominio por rango de posición. La señal
  // más útil para comparar "fuerza" entre dominios (quién tiene más top-3).
  positionBuckets: PositionBuckets | null;
  avgPosition: number | null; // metrics.organic.avg_position (si viene)
};

type OrganicMetrics = {
  etv?: number;
  count?: number;
  avg_position?: number;
  pos_1?: number;
  pos_2_3?: number;
  pos_4_10?: number;
  pos_11_20?: number;
  pos_21_30?: number;
  pos_31_40?: number;
  pos_41_50?: number;
  pos_51_60?: number;
  pos_61_70?: number;
  pos_71_80?: number;
  pos_81_90?: number;
  pos_91_100?: number;
};

type KeywordInfo = {
  search_volume?: number;
  competition?: string;
  competition_index?: number;
  cpc?: number;
  monthly_searches?: Array<{ year?: number; month?: number; searches?: number }>;
};

type SerpElement = {
  rank_absolute?: number;
  title?: string;
  url?: string;
  description?: string;
};

// Suma de buckets de posición a tres rangos accionables: top-3, top-10 (4-10)
// y top-100 (resto). Si DataForSEO no entrega ningún bucket, devuelve null.
function buildBuckets(o: OrganicMetrics | undefined): PositionBuckets | null {
  if (!o) return null;
  const hasAny =
    o.pos_1 != null || o.pos_2_3 != null || o.pos_4_10 != null || o.pos_11_20 != null;
  if (!hasAny) return null;
  const num = (v: number | undefined) => (typeof v === "number" ? v : 0);
  return {
    top3: num(o.pos_1) + num(o.pos_2_3),
    top10: num(o.pos_4_10),
    top100:
      num(o.pos_11_20) +
      num(o.pos_21_30) +
      num(o.pos_31_40) +
      num(o.pos_41_50) +
      num(o.pos_51_60) +
      num(o.pos_61_70) +
      num(o.pos_71_80) +
      num(o.pos_81_90) +
      num(o.pos_91_100),
  };
}

// Aplana monthly_searches (array de {year,month,searches}) a number[] ordenado
// cronológicamente (mes más antiguo → más reciente). Devuelve null si no hay.
function flattenMonthlySearches(ms: KeywordInfo["monthly_searches"]): number[] | null {
  if (!Array.isArray(ms) || ms.length === 0) return null;
  const sorted = [...ms]
    .filter((m) => m && typeof m.searches === "number")
    .sort((a, b) => {
      const ka = (a.year ?? 0) * 12 + (a.month ?? 0);
      const kb = (b.year ?? 0) * 12 + (b.month ?? 0);
      return ka - kb;
    });
  if (sorted.length === 0) return null;
  return sorted.map((m) => m.searches as number);
}

// Visibilidad de un dominio: tráfico orgánico estimado mensual (etv), nº de
// keywords orgánicas (count), distribución de posiciones y posición media.
// Datos en tasks[0].result[0].items[0].metrics.organic.
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
  const organic = (item?.metrics as Record<string, unknown> | undefined)?.organic as OrganicMetrics | undefined;
  return {
    organicTraffic: typeof organic?.etv === "number" ? organic.etv : null,
    organicKeywords: typeof organic?.count === "number" ? organic.count : null,
    positionBuckets: buildBuckets(organic),
    avgPosition: typeof organic?.avg_position === "number" ? organic.avg_position : null,
    costUsd: typeof task.cost === "number" ? task.cost : null,
  };
}

// Top keywords por las que rankea un dominio, con posición, volumen, CPC,
// dificultad, estacionalidad y la URL + snippet del competidor.
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
    const ki = kd?.keyword_info as KeywordInfo | undefined;
    const serp = (raw.ranked_serp_element as Record<string, unknown> | undefined)?.serp_item as SerpElement | undefined;
    const keyword = typeof kd?.keyword === "string" ? kd.keyword : null;
    if (!keyword) continue;
    ranked.push({
      keyword,
      position: typeof serp?.rank_absolute === "number" ? serp.rank_absolute : null,
      volume: typeof ki?.search_volume === "number" ? ki.search_volume : null,
      competition: typeof ki?.competition === "string" ? ki.competition : null,
      competitionIndex: typeof ki?.competition_index === "number" ? ki.competition_index : null,
      cpc: typeof ki?.cpc === "number" ? ki.cpc : null,
      monthlySearches: flattenMonthlySearches(ki?.monthly_searches),
      title: typeof serp?.title === "string" ? serp.title : null,
      url: typeof serp?.url === "string" ? serp.url : null,
      description: typeof serp?.description === "string" ? serp.description : null,
    });
  }
  return { items: ranked, costUsd: typeof task.cost === "number" ? task.cost : null };
}

// Content gap: keywords por las que `competitorDomain` rankea y `projectDomain`
// NO. domain_intersection con intersections:false (target1=competidor,
// target2=proyecto) → solo keywords del competidor que el proyecto no tiene.
// Mismo nivel de detalle por keyword que ranked_keywords (cpc, dificultad,
// URL y snippet del competidor — antes se tiraban).
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
    const ki = kd?.keyword_info as KeywordInfo | undefined;
    const first = raw.first_domain_serp_element as SerpElement | undefined;
    const keyword = typeof kd?.keyword === "string" ? kd.keyword : null;
    if (!keyword) continue;
    gap.push({
      keyword,
      position: typeof first?.rank_absolute === "number" ? first.rank_absolute : null,
      volume: typeof ki?.search_volume === "number" ? ki.search_volume : null,
      competition: typeof ki?.competition === "string" ? ki.competition : null,
      competitionIndex: typeof ki?.competition_index === "number" ? ki.competition_index : null,
      cpc: typeof ki?.cpc === "number" ? ki.cpc : null,
      monthlySearches: flattenMonthlySearches(ki?.monthly_searches),
      title: typeof first?.title === "string" ? first.title : null,
      url: typeof first?.url === "string" ? first.url : null,
      description: typeof first?.description === "string" ? first.description : null,
    });
  }
  return { items: gap, costUsd: typeof task.cost === "number" ? task.cost : null };
}

export { normalizeDomain };
