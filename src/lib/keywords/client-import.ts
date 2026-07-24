// Helper de cliente (fetch) para crear un estudio de Keywords a partir de
// keywords que YA tienen sus métricas resueltas (competidores, geogrid...) —
// dos pasos contra endpoints ya existentes: crea el estudio vacío, luego
// añade las keywords con sus datos reales. Coste cero: no se vuelve a
// consultar DataForSEO, a diferencia de "pegar lista".

export type ImportableKeyword = {
  keyword: string;
  volume: number | null;
  competition: string | null;
  cpc: number | null;
  monthlySearches: number[] | null;
  difficulty?: number | null;
};

export async function importKeywordsToNewStudy(
  projectId: string,
  studyName: string,
  items: ImportableKeyword[],
  locationCode?: number
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const createRes = await fetch(`/api/proyectos/${projectId}/keywords/estudios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: studyName, keywords: "", locationCode }),
  });
  const study = await createRes.json();
  if (!createRes.ok) return { ok: false, error: study.error ?? "Error al crear el estudio" };

  const addRes = await fetch(`/api/proyectos/${projectId}/keywords/estudios/${study.id}/keywords`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      items: items.map((k) => ({
        keyword: k.keyword,
        searchVolume: k.volume,
        competition: k.competition,
        cpc: k.cpc,
        monthlySearches: k.monthlySearches,
        difficulty: k.difficulty ?? null,
      })),
    }),
  });
  const data = await addRes.json();
  if (!addRes.ok) return { ok: false, error: data.error ?? "Error al añadir las keywords al estudio" };
  return { ok: true, added: data.added ?? items.length };
}
