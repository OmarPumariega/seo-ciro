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
  rating: number | null;
  reviewsCount: number | null;
  category: string | null;
  address: string | null;
  placeId: string | null;
  domain: string | null;
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
  address: string | null;
  lat: number | null;
  lng: number | null;
  placeId: string | null;
  domain: string | null;
  isMatch: boolean; // true si es el negocio del proyecto
};

// Antes 5: recortaba el pack local pagado sin motivo. El array completo (10-20
// negocios típicos) ya viene en la misma respuesta — capturarlo todo es coste
// marginal cero y alimenta el resumen agregado "quién gana en toda la rejilla".
const TOP_ITEMS_LIMIT = 20;

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
  address?: string;
  latitude?: number;
  longitude?: number;
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

  let match: MapsTopItem | null = null;
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

    const entry: MapsTopItem = {
      position: pos,
      title: itemTitle || "(sin nombre)",
      rating: typeof item.rating?.value === "number" ? item.rating.value : null,
      reviewsCount: typeof item.rating?.votes_count === "number" ? item.rating.votes_count : null,
      url: typeof item.url === "string" ? item.url : null,
      category: typeof item.category === "string" ? item.category : null,
      address: typeof item.address === "string" ? item.address : null,
      lat: typeof item.latitude === "number" ? item.latitude : null,
      lng: typeof item.longitude === "number" ? item.longitude : null,
      placeId: itemPlaceId || null,
      domain: itemDomain || null,
      isMatch,
    };
    allRanked.push(entry);

    // El negocio propio: el item completo (no solo posición/título/url como
    // antes), y solo se guarda el de mejor posición si aparece más de una vez.
    if (isMatch && (match === null || pos < match.position)) {
      match = entry;
    }
  }

  allRanked.sort((a, b) => a.position - b.position);

  const rank: MapsRank = match
    ? {
        position: match.position,
        title: match.title,
        url: match.url,
        rating: match.rating,
        reviewsCount: match.reviewsCount,
        category: match.category,
        address: match.address,
        placeId: match.placeId,
        domain: match.domain,
      }
    : {
        position: null,
        title: null,
        url: null,
        rating: null,
        reviewsCount: null,
        category: null,
        address: null,
        placeId: null,
        domain: null,
      };

  return {
    rank,
    costUsd: typeof task.cost === "number" ? task.cost : null,
    top: allRanked.slice(0, TOP_ITEMS_LIMIT),
  };
}

// Re-export para que el llamador no dependa de rank/serp directamente.
export { normalizeDomain };
