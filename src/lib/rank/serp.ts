import { postTask } from "@/lib/dataforseo/client";

// Cliente de SERP de DataForSEO (Módulo 5 — Rank Tracking). Llama al
// endpoint Live Advanced de orgánicos de Google y localiza en qué posición
// aparece el dominio del proyecto. Principio del proyecto: nada se inventa,
// la posición proviene del rank_absolute real del item orgánico coincidente.

// Profundidad por defecto del SERP = top-10. La mayoría del valor accionable
// del rank tracking está en página 1; depth mayor (30/50/100) solo para
// keywords donde interesa ver posiciones profundas. DataForSEO factura por
// bloque de 10 resultados, así que depth=10 es ~10x más barato que depth=100.
export const DEFAULT_DEPTH = 10;
export const ALLOWED_DEPTHS = [10, 30, 50, 100] as const;

export type SerpRank = {
  position: number | null; // null = el dominio no apareció en el depth pedido
  url: string | null; // URL del proyecto que posiciona
};

export type SerpResult = {
  rank: SerpRank;
  costUsd: number | null;
};

// Normaliza el dominio de un proyecto a su forma registrable: quita esquema,
// "www." inicial y path. "https://www.demo-seo.com/" → "demo-seo.com".
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim();
}

// ¿El dominio del item (DataForSEO siempre lo da con subdominio, ej.
// "blog.demo-seo.com") pertenece al dominio del proyecto? Match exacto o por
// sufijo (cualquier subdominio cuenta como del proyecto).
export function domainMatches(itemDomain: string, projectDomain: string): boolean {
  const item = itemDomain.toLowerCase().replace(/^www\./, "");
  const proj = projectDomain.toLowerCase();
  return item === proj || item.endsWith("." + proj);
}

type OrganicItem = {
  type?: string;
  rank_absolute?: number;
  domain?: string;
  url?: string;
};

export async function checkSerpRank(params: {
  keyword: string;
  locationCode: number;
  languageCode: string;
  device: string;
  projectDomain: string; // ya normalizado (sin esquema/www)
  depth?: number; // 10/30/50/100, default DEFAULT_DEPTH
}): Promise<SerpResult> {
  const { keyword, locationCode, languageCode, device, projectDomain } = params;
  const depth = params.depth ?? DEFAULT_DEPTH;

  const task = await postTask(
    "/v3/serp/google/organic/live/advanced",
    {
      keyword,
      location_code: locationCode,
      language_code: languageCode,
      device,
      depth,
    },
    "rank"
  );

  // Cadena a los orgánicos: tasks[0].result[0].items.
  const resultArr = Array.isArray(task.result) ? (task.result as Array<Record<string, unknown>>) : [];
  const resultObj = resultArr[0] ?? {};
  const organicItems = Array.isArray(resultObj.items) ? (resultObj.items as Array<Record<string, unknown>>) : [];

  // El dominio puede aparecer varias veces (varias URLs del mismo proyecto).
  // Nos quedamos con la mejor posición (rank_absolute más bajo = más arriba).
  let bestPosition: number | null = null;
  let bestUrl: string | null = null;
  for (const raw of organicItems) {
    const item = raw as OrganicItem;
    if (item.type !== "organic") continue;
    const itemDomain = typeof item.domain === "string" ? item.domain : "";
    if (!domainMatches(itemDomain, projectDomain)) continue;
    const pos = typeof item.rank_absolute === "number" ? item.rank_absolute : null;
    if (pos === null) continue;
    if (bestPosition === null || pos < bestPosition) {
      bestPosition = pos;
      bestUrl = typeof item.url === "string" ? item.url : null;
    }
  }

  return {
    rank: { position: bestPosition, url: bestUrl },
    costUsd: typeof task.cost === "number" ? task.cost : null,
  };
}
