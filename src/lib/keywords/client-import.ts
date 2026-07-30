// Helper de cliente (fetch) para llevar keywords que YA tienen sus métricas
// resueltas (competidores, TF-IDF, geogrid...) al estudio "General" único del
// proyecto — se obtiene/crea ese estudio y se añaden ahí, con su
// procedencia (`source`) para poder distinguirlas luego. Coste cero: no se
// vuelve a consultar DataForSEO, a diferencia de "pegar lista".

export type ImportableKeyword = {
  keyword: string;
  volume: number | null;
  competition: string | null;
  cpc: number | null;
  monthlySearches: number[] | null;
  difficulty?: number | null;
};

export async function importKeywordsToDefaultStudy(
  projectId: string,
  source: string,
  items: ImportableKeyword[],
  // Ubicación/idioma REALES de donde vienen las métricas (p.ej. la elegida en
  // el LocationPicker de Competidores al analizar). Si no se indica, el
  // endpoint usa la del estudio "General" (comportamiento anterior) — pero
  // cuando la fuente usó otra ubicación, hay que pasarla para no cachear el
  // volumen de esa ubicación como si fuera el de la del estudio.
  sourceLocation?: { locationCode: number; languageCode: string }
): Promise<{ ok: true; added: number; studyId: string } | { ok: false; error: string }> {
  const defaultRes = await fetch(`/api/proyectos/${projectId}/keywords/estudios/default`, {
    method: "POST",
  });
  const defaultData = await defaultRes.json();
  if (!defaultRes.ok) return { ok: false, error: defaultData.error ?? "Error al obtener el estudio General" };
  const studyId: string = defaultData.studyId;

  const addRes = await fetch(`/api/proyectos/${projectId}/keywords/estudios/${studyId}/keywords`, {
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
        source,
      })),
      locationCode: sourceLocation?.locationCode,
      languageCode: sourceLocation?.languageCode,
    }),
  });
  const data = await addRes.json();
  if (!addRes.ok) return { ok: false, error: data.error ?? "Error al añadir las keywords al estudio" };
  return { ok: true, added: data.added ?? items.length, studyId };
}
