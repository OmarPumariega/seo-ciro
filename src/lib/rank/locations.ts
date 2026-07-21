// Resolución inversa de locationCode → nombre legible usando el mismo JSON
// estático que LocationPicker (foto real de GET /v3/serp/google/locations/ES,
// sin coste). Se usa al importar keywords del Módulo 1 al Rank Tracking
// (RankKeyword.locationName) y en el bootstrap del proyecto, para que la
// ubicación elegida en el estudio (p.ej. Oviedo) no se pierda al crear las
// keywords de seguimiento — sin esto, la UI de Rank Tracking mostraría
// "Nacional" aunque el locationCode sea correcto.
import locations from "@/lib/rank/locations-es.json";

type LocationEntry = { code: number; name: string; type: string };
const ALL = locations as LocationEntry[];

// Mapa por code para resolución O(1). Si DataForSEO devuelve varias entradas
// con el mismo code (ciudad + municipio), gana la primera aparición —
// normalmente es la de tipo "City", que es la que el usuario ve en el picker.
const BY_CODE = new Map<number, LocationEntry>();
for (const loc of ALL) {
  if (!BY_CODE.has(loc.code)) BY_CODE.set(loc.code, loc);
}

// Devuelve el nombre legible (p.ej. "Oviedo,Oviedo,Asturias,Spain") o null si
// el código no está en la lista (puede pasar para ubicaciones fuera de España
// o códigos nuevos que no estén en la foto estática).
export function resolveLocationName(code: number | null | undefined): string | null {
  if (code === null || code === undefined || !Number.isInteger(code) || code <= 0) return null;
  return BY_CODE.get(code)?.name ?? null;
}
