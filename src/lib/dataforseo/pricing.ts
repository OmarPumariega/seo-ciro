// Estimaciones de coste de DataForSEO para mostrar ANTES de confirmar una
// acción que gasta (estilo WebCEO: "este seguimiento mensual costará X"). Las
// estimaciones se basan en los precios reales verificados contra la API:
//
//   • Rank SERP: depth=10 → 0,002$, depth=100 → 0,020$ → ~0,0002$ por unidad
//     de depth (DataForSEO factura por bloque de 10 resultados).
//   • Maps SERP: ~0,002$ por punto de la rejilla.
//
// El coste REAL es el que devuelve la API en tasks[0].cost (se registra en
// ApiUsageLog); estas funciones son solo una proyección orientativa para la
// confirmación previa del usuario.

const RANK_COST_PER_DEPTH_UNIT = 0.0002;
export const MAPS_COST_PER_POINT = 0.002;
// Sugerencias de keywords: ~0,01$ por resultado devuelto (verificado contra la
// doc: limit 1 → 0,0101$). Controla el coste con `limit`.
export const SUGGESTION_COST_PER_RESULT = 0.01;

// Estudio del Módulo 1: tarifa plana por llamada (hasta 1000 keywords) — una
// de volumen (~0,09$) + una de intención (~0,013$). Solo aplica a keywords NO
// cacheadas; las que ya lo están (30 días) no gastan.
export const KEYWORDS_STUDY_FLAT_COST_USD = 0.1;

// Chequeos/mes según frecuencia programada (manual no suma: solo al dispararlo).
export const FREQUENCY_PER_MONTH: Record<string, number> = {
  manual: 0,
  daily: 30,
  weekly: 4.33,
  monthly: 1,
  quarterly: 0.33,
};

// Coste de UN chequeo de rank tracking según el depth pedido.
export function rankCheckCostUsd(depth: number): number {
  return Math.round(depth * RANK_COST_PER_DEPTH_UNIT * 1000) / 1000;
}

// Coste mensual estimado de seguir N keywords con un depth y frecuencia dados.
// Las de frecuencia "manual" no contribuyen (no se chequean solas).
export function rankMonthlyCostUsd(count: number, depth: number, frequency: string): number {
  const perMonth = FREQUENCY_PER_MONTH[frequency] ?? 0;
  return Math.round(count * rankCheckCostUsd(depth) * perMonth * 100) / 100;
}

// Coste estimado de una rejilla de geogrid (N×N puntos × Maps SERP por punto).
export function geogridCostUsd(gridSize: number): number {
  return Math.round(gridSize * gridSize * MAPS_COST_PER_POINT * 1000) / 1000;
}

// Coste estimado de una búsqueda de sugerencias (nº de resultados pedidos).
export function suggestionsCostUsd(limit: number): number {
  return Math.round(limit * SUGGESTION_COST_PER_RESULT * 100) / 100;
}

// DataForSEO Labs (competidores). Precio real publicado por DataForSEO para
// estos endpoints: 0,012$ por tarea (fijo, cada llamada) + 0,00012$ por ítem
// devuelto (dataforseo.com/pricing/dataforseo-labs/dataforseo-google-api).
// Verificado contra los 3 costes reales ya registrados en ApiUsageLog: coinciden
// exactamente con esta fórmula (antes se asumía 0,01$/resultado, ~83x el precio
// real, lo que inflaba la estimación mostrada al usuario muy por encima del
// coste real). El coste REAL sigue siendo el que devuelve la API
// (registrado en ApiUsageLog); esto es solo orientativo, para que el usuario
// sepa cuánto cuesta ANTES de lanzar el análisis o el content gap.
const LABS_TASK_COST_USD = 0.012;
const LABS_ITEM_COST_USD = 0.00012;
// DataForSEO cobra por ítem REALMENTE devuelto, no por el `limit` pedido — así
// que pedir el máximo (1000, el techo real de ranked_keywords/domain_intersection)
// no encarece el caso normal (un dominio con 15 keywords sigue costando lo de 15),
// solo evita que un dominio grande se quede corto en la lista.
export const COMPETITORS_ANALYZE_DEFAULT_LIMIT = 1000;
export const COMPETITORS_GAP_DEFAULT_LIMIT = 1000;

// "Analizar" = domain_rank_overview (1 tarea + 1 ítem) + ranked_keywords (1 tarea + limit ítems).
export function competitorAnalysisCostUsd(limit = COMPETITORS_ANALYZE_DEFAULT_LIMIT): number {
  const overview = LABS_TASK_COST_USD + LABS_ITEM_COST_USD;
  const ranked = LABS_TASK_COST_USD + limit * LABS_ITEM_COST_USD;
  return Math.round((overview + ranked) * 1000) / 1000;
}
// "Content gap" = domain_intersection (1 tarea + limit ítems).
export function contentGapCostUsd(limit = COMPETITORS_GAP_DEFAULT_LIMIT): number {
  return Math.round((LABS_TASK_COST_USD + limit * LABS_ITEM_COST_USD) * 1000) / 1000;
}
