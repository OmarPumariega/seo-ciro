import { postTask } from "@/lib/dataforseo/client";
import { normalizeDomain, domainMatches } from "@/lib/rank/serp";

// Cliente de Maps SERP de DataForSEO (Módulo 9 — Geogrid). Consulta Google
// Maps en una coordenada exacta (location_coordinate "lat,lng,zoom") y
// localiza la posición del negocio del proyecto entre los resultados.
//
// Match del negocio: por dominio (si el proyecto lo tiene) o por nombre
// (businessName). El dominio es más fiable cuando el GBP lo incluye; el
// nombre cubre negocios sin web confirmada en GBP.

const MAPS_ZOOM = 15; // ~vecinal (~1,2 km de área por punto)

export type MapsRank = {
  position: number | null; // null = el negocio no apareció en el depth pedido
  title: string | null; // nombre del negocio tal cual aparece en Maps
  url: string | null;
};

export type MapsResult = {
  rank: MapsRank;
  costUsd: number | null;
};

type MapsItem = {
  type?: string;
  rank_absolute?: number;
  domain?: string | null;
  title?: string;
  url?: string | null;
  place_id?: string;
};

function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function checkMapsRank(params: {
  keyword: string;
  lat: number;
  lng: number;
  languageCode: string;
  projectDomain: string | null; // normalizado, o null si no hay
  businessName: string | null;
  gbpName?: string | null; // nombre exacto de la ficha GBP (más fiable que businessName)
  gbpPlaceId?: string | null; // place_id de Google (matching 1:1, lo más fiable)
}): Promise<MapsResult> {
  const { keyword, lat, lng, languageCode, projectDomain, businessName } = params;

  const task = await postTask(
    "/v3/serp/google/maps/live/advanced",
    {
      keyword,
      location_coordinate: `${lat},${lng},${MAPS_ZOOM}z`,
      language_code: languageCode,
    },
    "maps"
  );

  const resultArr = Array.isArray(task.result) ? (task.result as Array<Record<string, unknown>>) : [];
  const resultObj = resultArr[0] ?? {};
  const items = Array.isArray(resultObj.items) ? (resultObj.items as Array<Record<string, unknown>>) : [];

  const normBizName = businessName ? normalizeName(businessName) : null;
  const normGbpName = params.gbpName ? normalizeName(params.gbpName) : null;
  const wantPlaceId = params.gbpPlaceId?.trim() || null;

  let bestPosition: number | null = null;
  let bestTitle: string | null = null;
  let bestUrl: string | null = null;

  for (const raw of items) {
    const item = raw as MapsItem;
    if (item.type !== "maps_search") continue;

    const itemDomain = typeof item.domain === "string" ? item.domain : "";
    const itemTitle = typeof item.title === "string" ? item.title : "";
    const itemPlaceId = typeof item.place_id === "string" ? item.place_id : "";

    // Prioridad de matching: place_id (1:1) > nombre exacto GBP > dominio >
    // businessName (incluye). Cuanto más arriba en la cadena, más fiable.
    const placeHit = wantPlaceId && itemPlaceId && itemPlaceId === wantPlaceId;
    const gbpHit = normGbpName && itemTitle && normalizeName(itemTitle) === normGbpName;
    const domainHit = projectDomain && itemDomain && domainMatches(itemDomain, projectDomain);
    const nameHit = normBizName && itemTitle && normalizeName(itemTitle).includes(normBizName);
    if (!placeHit && !gbpHit && !domainHit && !nameHit) continue;

    const pos = typeof item.rank_absolute === "number" ? item.rank_absolute : null;
    if (pos === null) continue;
    if (bestPosition === null || pos < bestPosition) {
      bestPosition = pos;
      bestTitle = itemTitle || null;
      bestUrl = typeof item.url === "string" ? item.url : null;
    }
  }

  return {
    rank: { position: bestPosition, title: bestTitle, url: bestUrl },
    costUsd: typeof task.cost === "number" ? task.cost : null,
  };
}

// Re-export para que el llamador no dependa de rank/serp directamente.
export { normalizeDomain };
