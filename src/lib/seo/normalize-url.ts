// Normaliza una URL para comparación (y como identidad de nodo en el crawler
// de Auditoría) — compartida entre el crawler (Módulo 8), el matching de rank
// tracking de Contenido → "Optimizar URL existente" (encontrar qué keyword(s)
// se siguen para una URL dada comparando contra RankPosition.url), y la
// siembra de la cola de crawl desde el sitemap.xml.
//
// Quita el hash, parámetros de tracking conocidos (no cualquier query param —
// `?page=2` o `?filtro=x` siguen siendo contenido distinto) y unifica
// trailing slash, para que `/x`, `/x/` y `/x?utm_source=...` no cuenten como
// páginas distintas y diluyan el PageRank real o generen huérfanas falsas.
const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "gclid", "fbclid", "msclkid", "mc_cid", "mc_eid", "ref", "_ga",
]);

export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";

    const params = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAMS.has(k.toLowerCase()))
      .sort(([a], [b]) => a.localeCompare(b));
    u.search = "";
    for (const [k, v] of params) u.searchParams.append(k, v);

    if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }

    return u.toString();
  } catch {
    return null;
  }
}
