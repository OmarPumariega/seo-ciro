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

// Top real del pack local en ese punto — mismo item que ya devuelve la
// llamada pagada, simplemente ya no se descarta. Alimenta el panel lateral
// "quién gana aquí" del mapa (estilo LocalFalcon/DinoRank), coste marginal
// cero porque es la misma respuesta que localiza nuestro propio negocio.
export type MapsTopItem = {
  position: number;
  title: string;
  rating: number | null;
  reviewsCount: number | null;
  url: string | null;
  category: string | null;
  isMatch: boolean; // true si es el negocio del proyecto
};

const TOP_ITEMS_LIMIT = 5;

export type MapsResult = {
  rank: MapsRank;
  costUsd: number | null;
  top: MapsTopItem[];
};

type MapsItem = {
  type?: string;
  rank_absolute?: number;
  domain?: string | null;
  title?: string;
  url?: string | null;
  place_id?: string;
  rating?: { value?: number; votes_count?: number } | null;
  category?: string | null;
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
  const allRanked: MapsTopItem[] = [];

  for (const raw of items) {
    const item = raw as MapsItem;
    if (item.type !== "maps_search") continue;

    const pos = typeof item.rank_absolute === "number" ? item.rank_absolute : null;
    if (pos === null) continue;

    const itemDomain = typeof item.domain === "string" ? item.domain : "";
    const itemTitle = typeof item.title === "string" ? item.title : "";
    const itemPlaceId = typeof item.place_id === "string" ? item.place_id : "";

    // Prioridad de matching: place_id (1:1) > nombre exacto GBP > dominio >
    // businessName (incluye). Cuanto más arriba en la cadena, más fiable.
    const placeHit = Boolean(wantPlaceId && itemPlaceId && itemPlaceId === wantPlaceId);
    const gbpHit = Boolean(normGbpName && itemTitle && normalizeName(itemTitle) === normGbpName);
    const domainHit = Boolean(projectDomain && itemDomain && domainMatches(itemDomain, projectDomain));
    const nameHit = Boolean(normBizName && itemTitle && normalizeName(itemTitle).includes(normBizName));
    const isMatch = placeHit || gbpHit || domainHit || nameHit;

    allRanked.push({
      position: pos,
      title: itemTitle || "(sin nombre)",
      rating: typeof item.rating?.value === "number" ? item.rating.value : null,
      reviewsCount: typeof item.rating?.votes_count === "number" ? item.rating.votes_count : null,
      url: typeof item.url === "string" ? item.url : null,
      category: typeof item.category === "string" ? item.category : null,
      isMatch,
    });

    if (isMatch && (bestPosition === null || pos < bestPosition)) {
      bestPosition = pos;
      bestTitle = itemTitle || null;
      bestUrl = typeof item.url === "string" ? item.url : null;
    }
  }

  allRanked.sort((a, b) => a.position - b.position);

  return {
    rank: { position: bestPosition, title: bestTitle, url: bestUrl },
    costUsd: typeof task.cost === "number" ? task.cost : null,
    top: allRanked.slice(0, TOP_ITEMS_LIMIT),
  };
}

// Re-export para que el llamador no dependa de rank/serp directamente.
export { normalizeDomain };
