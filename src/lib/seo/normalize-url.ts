// Normaliza una URL para comparación (quita el hash, valida http/https) —
// compartida entre el crawler de Auditoría (Módulo 8) y el matching de rank
// tracking de Contenido → "Optimizar URL existente" (encontrar qué keyword(s)
// se siguen para una URL dada comparando contra RankPosition.url).
export function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}
