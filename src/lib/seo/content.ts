export const CONTENT_TYPES = ["blog", "pagina", "producto", "novedad_gbp"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  blog: "Blog",
  pagina: "Página",
  producto: "Producto",
  novedad_gbp: "Novedad GBP",
};

// Longitud objetivo por defecto según el tipo — punto de partida razonable,
// el formulario permite ajustar el número exacto por generación.
export const DEFAULT_TARGET_WORDS: Record<ContentType, number> = {
  blog: 900,
  pagina: 500,
  producto: 200,
  novedad_gbp: 80,
};

export function buildSystemPrompt(
  type: ContentType,
  targetWords: number,
  toneOfVoice: string | null
): string {
  return `Eres un redactor SEO senior escribiendo contenido en español para una agencia de marketing digital.

Tipo de contenido: ${CONTENT_TYPE_LABELS[type]}
Longitud objetivo: aproximadamente ${targetWords} palabras (±15%).
${toneOfVoice ? `Tono de marca del cliente: ${toneOfVoice}` : "Tono de marca: no especificado — usa un tono profesional y cercano por defecto."}

FORMATO DE SALIDA:
- Texto plano con la jerarquía de encabezados marcada en Markdown (# para H1, ## para H2, ### para H3).
- Un único H1 al principio.
- Párrafos cortos, fáciles de leer.
- Sin introducciones tipo "Aquí tienes el contenido solicitado" ni explicaciones fuera del propio contenido — devuelve solo el contenido final.

REGLAS CRÍTICAS:
- Nunca inventes datos concretos (cifras, direcciones, precios, nombres de personas) que no se te hayan proporcionado.
- Si no se te da ninguna URL para enlazar, no inventes enlaces ni menciones enlaces internos.
- Si se te da una keyword objetivo, intégrala de forma natural (título, algún encabezado, primer párrafo) sin repetirla artificialmente (keyword stuffing).
- Evita frases vacías y clichés de marketing genérico ("líderes en el sector", "la mejor calidad").`;
}

export function buildUserMessage(params: {
  topic: string;
  keyword: string | null;
  targetUrl: string | null;
  internalLinks: string | null;
}): string {
  const lines = [`Tema: ${params.topic}`];
  if (params.keyword) lines.push(`Keyword objetivo: ${params.keyword}`);
  if (params.targetUrl) lines.push(`URL destino de este contenido: ${params.targetUrl}`);
  if (params.internalLinks) {
    lines.push(
      `Enlaces internos a tejer de forma natural en el texto (usa un anchor text relevante para cada uno):\n${params.internalLinks}`
    );
  }
  lines.push("\nEscribe el contenido siguiendo las reglas del system prompt.");
  return lines.join("\n");
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
