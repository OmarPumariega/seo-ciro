// Límites conservadores para evitar payloads desproporcionados en campos de
// texto libre (el formulario no los impone todos en el cliente, así que el
// servidor es la última línea de defensa).
export const MAX_SHORT = 200;
export const MAX_LONG = 4000;

export function normalizeText(value: unknown, maxLength: number = MAX_SHORT): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, maxLength);
  return trimmed || null;
}

export function normalizeRequiredText(value: unknown, maxLength: number = MAX_SHORT): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
