// Quita los code fences (```json ... ```) que los modelos de IA añaden a
// veces pese a pedirse JSON puro. Compartido por todos los generadores que
// esperan un JSON de vuelta del LLM (Módulo 4 Schema, Módulo 1 estructura
// de URLs, ...).
export function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(json)?\n?/i, "")
    .replace(/```$/, "")
    .trim();
}
