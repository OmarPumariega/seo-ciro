// Normaliza una keyword: trim + minúsculas + espacios colapsados a uno.
// Es lo que hace que tanto el @@unique([studyId, keyword]) como la clave de
// caché (keyword, idioma, ubicación) funcionen de verdad entre variantes de
// mayúsculas/espaciado de un mismo término.
export function normalizeKeyword(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
