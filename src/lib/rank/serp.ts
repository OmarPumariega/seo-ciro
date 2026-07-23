import { postTask } from "@/lib/dataforseo/client";
import { saveSerpCache, type CachedSerpItem } from "@/lib/dataforseo/serp-cache";

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
  // Posición de cada dominio competidor DENTRO DEL MISMO SERP ya pagado —
  // coste marginal cero, antes se descartaba. Clave = dominio competidor tal
  // cual se pidió (normalizado por el caller).
  competitors: Record<string, SerpRank>;
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
  title?: string;
  description?: string;
};

export async function checkSerpRank(params: {
  keyword: string;
  locationCode: number;
  languageCode: string;
  device: string;
  projectDomain: string; // ya normalizado (sin esquema/www)
  depth?: number; // 10/30/50/100, default DEFAULT_DEPTH
  // Dominios de competidores (Módulo Competidores) a localizar en el mismo
  // SERP — opcional, no cambia el coste de la llamada.
  competitorDomains?: string[];
}): Promise<SerpResult> {
  const { keyword, locationCode, languageCode, device, projectDomain } = params;
  const depth = params.depth ?? DEFAULT_DEPTH;
  const competitorDomains = params.competitorDomains ?? [];

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

  // Guarda el top-10 orgánico en la caché de SERP para que el TF-IDF (u otros
  // módulos) lo reutilice sin pagar otro SERP. CON await: el caller (check.ts)
  // dispara autoRunTfidf justo después, que lee getCachedSerp — si esto no se
  // hubiera resuelto aún, el TF-IDF no encontraría el cache y pediría OTRO
  // SERP pagando dos veces por el mismo dato. Una upsert es rápida; no merece
  // la pena el riesgo de carrera por ahorrar unos ms.
  // Además de url/title/domain, guardamos position (rank_absolute) y
  // description (snippet): llegan gratis en el mismo item que ya pagamos y
  // son justo lo que el TF-IDF necesita para mostrar "cómo posiciona Google
  // al competidor" como ejemplo de copy. Antes se tiraban.
  const topForCache: CachedSerpItem[] = [];
  for (const raw of organicItems) {
    const item = raw as OrganicItem;
    if (item.type !== "organic") continue;
    topForCache.push({
      url: typeof item.url === "string" ? item.url : "",
      title: typeof item.title === "string" ? item.title : "",
      domain: typeof item.domain === "string" ? item.domain : "",
      position: typeof item.rank_absolute === "number" ? item.rank_absolute : undefined,
      description: typeof item.description === "string" ? item.description : undefined,
    });
    if (topForCache.length >= 10) break;
  }
  if (topForCache.length > 0) {
    await saveSerpCache({ keyword, locationCode, languageCode, device, results: topForCache });
  }

  // El dominio puede aparecer varias veces (varias URLs del mismo dominio).
  // Nos quedamos con la mejor posición (rank_absolute más bajo = más arriba).
  function bestMatch(domain: string): SerpRank {
    let bestPosition: number | null = null;
    let bestUrl: string | null = null;
    for (const raw of organicItems) {
      const item = raw as OrganicItem;
      if (item.type !== "organic") continue;
      const itemDomain = typeof item.domain === "string" ? item.domain : "";
      if (!domainMatches(itemDomain, domain)) continue;
      const pos = typeof item.rank_absolute === "number" ? item.rank_absolute : null;
      if (pos === null) continue;
      if (bestPosition === null || pos < bestPosition) {
        bestPosition = pos;
        bestUrl = typeof item.url === "string" ? item.url : null;
      }
    }
    return { position: bestPosition, url: bestUrl };
  }

  const competitors: Record<string, SerpRank> = {};
  for (const domain of competitorDomains) {
    competitors[domain] = bestMatch(domain);
  }

  return {
    rank: bestMatch(projectDomain),
    costUsd: typeof task.cost === "number" ? task.cost : null,
    competitors,
  };
}
