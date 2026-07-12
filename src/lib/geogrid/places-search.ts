import { postTask } from "@/lib/dataforseo/client";

// Búsqueda de la ficha de Google (Maps/Google Business Profile) de un
// negocio por nombre, para que el usuario elija la correcta ANTES de fijar
// el centro del geogrid — en vez de teclear lat/lng a mano (fuente de
// errores como un signo de longitud invertido). Reutiliza el mismo endpoint
// de Maps SERP que ya paga el Módulo 9 (coste real ~$0.002-0.005 por
// búsqueda), sin necesidad de la Business Profile API de Google (bloqueada
// hasta aprobación, ver CLAUDE.md) — esto es una búsqueda pública tipo
// "Google Maps", no requiere ser dueño de la ficha.
//
// location_name: "Spain" busca en todo el país; basta con que el usuario
// incluya la ciudad en la query (igual que buscaría en Google Maps) para
// que la relevancia de Google haga el resto.

export type GbpCandidate = {
  placeId: string;
  title: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  rating: number | null;
  reviewsCount: number | null;
  category: string | null;
};

const MAX_CANDIDATES = 8;

type RawMapsItem = {
  type?: string;
  place_id?: string;
  title?: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  rating?: { value?: number; votes_count?: number } | null;
  category?: string | null;
};

export async function searchGbpCandidates(
  query: string
): Promise<{ candidates: GbpCandidate[]; costUsd: number | null }> {
  const task = await postTask(
    "/v3/serp/google/maps/live/advanced",
    { keyword: query, location_name: "Spain", language_code: "es" },
    "modulo9.geogrid.buscar-ficha"
  );

  const resultArr = Array.isArray(task.result) ? (task.result as Array<Record<string, unknown>>) : [];
  const items = Array.isArray(resultArr[0]?.items) ? (resultArr[0].items as RawMapsItem[]) : [];

  const candidates: GbpCandidate[] = [];
  for (const item of items) {
    if (item.type !== "maps_search") continue;
    if (typeof item.place_id !== "string" || !item.place_id) continue;
    candidates.push({
      placeId: item.place_id,
      title: typeof item.title === "string" ? item.title : "(sin nombre)",
      address: typeof item.address === "string" ? item.address : null,
      lat: typeof item.latitude === "number" ? item.latitude : null,
      lng: typeof item.longitude === "number" ? item.longitude : null,
      rating: typeof item.rating?.value === "number" ? item.rating.value : null,
      reviewsCount: typeof item.rating?.votes_count === "number" ? item.rating.votes_count : null,
      category: typeof item.category === "string" ? item.category : null,
    });
    if (candidates.length >= MAX_CANDIDATES) break;
  }

  return { candidates, costUsd: typeof task.cost === "number" ? task.cost : null };
}
