import type { ScrapedPage } from "@/lib/seo/scrape";

export const TITLE_MAX_CHARS = 65;
export const DESC_MAX_CHARS = 155;

export type TitleMetaVariant = { title: string; description: string };

export function buildSystemPrompt(seoRules: string): string {
  return `Eres un SEO Manager Senior y Experto en Copywriting de Respuesta Directa (Direct Response). Tu objetivo es generar Títulos y Meta Descripciones optimizados para la página web que se te proporcionará, aplicando técnicas avanzadas de psicología de ventas y SEO técnico.

A continuación tienes el documento completo con todas las reglas SEO que DEBES seguir estrictamente:

---
${seoRules}
---

FORMATO DE SALIDA ESTRICTO (No incluyas markdown, introducciones, conclusiones ni explicaciones extra. Solo lo que sigue):

Variante 1:
Título: [Tu título]
Descripción: [Tu descripción]

Variante 2:
Título: [Tu título]
Descripción: [Tu descripción]

Variante 3:
Título: [Tu título]
Descripción: [Tu descripción]

LÍMITES DE CARACTERES — REGLA ABSOLUTA E INNEGOCIABLE:
- Cada TÍTULO debe tener como MÁXIMO 60 caracteres. NUNCA superar los 65 caracteres bajo ninguna circunstancia. Si un título supera los 60 caracteres, reescríbelo más corto.
- Cada DESCRIPCIÓN debe tener como MÁXIMO 150 caracteres. NUNCA superar los 155 caracteres bajo ninguna circunstancia. Si una descripción supera los 150 caracteres, reescríbela más corta.
- Cuenta cada letra, cada espacio, cada signo de puntuación. Verifica el conteo ANTES de incluir cada línea.
- Es PREFERIBLE un título de 55 caracteres excelente que uno de 66 caracteres que se corte en Google.
- Es PREFERIBLE una descripción de 140 caracteres clara que una de 160 que se trunque.

REGLAS CRÍTICAS DE FORMATO:
- Sigue TODAS las reglas del documento de reglas SEO sin excepción.
- NUNCA incluyas el conteo de caracteres en el texto de salida. No añadas "(X caracteres)" ni indicaciones de longitud.
- Devuelve SOLO el texto limpio de cada título y descripción.
- No incluyas nada más que las 3 variantes en el formato exacto indicado arriba.`;
}

export function buildUserMessage(url: string, scraped: ScrapedPage, keyword: string | null): string {
  const pageContext = `
Título actual: ${scraped.title}
Meta descripción actual: ${scraped.metaDescription}
H1 principal: ${scraped.h1}
Contenido principal extraído: ${scraped.bodyText}
`;

  const keywordLine = keyword
    ? `\nPalabra clave objetivo indicada manualmente: ${keyword}`
    : "";

  return `Analiza esta URL y genera los títulos y descripciones SEO según las reglas.\n\nURL: ${url}\n\nContexto extraído de la página:\n${pageContext}${keywordLine}`;
}

// Quita anotaciones tipo "(NN caracteres)" que el modelo a veces añade pese
// a la instrucción explícita de no hacerlo.
function cleanCharCount(text: string): string {
  return text
    .replace(/\s*\(\d+\s*caracteres\)/gi, "")
    .replace(/\s*\[\d+\s*caracteres\]/gi, "")
    .replace(/\s*—\s*\d+\s*caracteres$/gi, "")
    .replace(/\s*-\s*\d+\s*caracteres$/gi, "")
    .trim();
}

// Corta en el último límite de palabra — nunca a mitad de palabra.
function truncateToLimit(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;

  let truncated = text.substring(0, maxLen);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) {
    truncated = truncated.substring(0, lastSpace);
  }

  return truncated.replace(/[,;:\-—]+\s*$/, "").trim();
}

export function parseVariants(text: string): TitleMetaVariant[] {
  const variants: TitleMetaVariant[] = [];
  const blocks = text.split(/Variante \d+:/).filter((block) => block.trim() !== "");

  blocks.forEach((block) => {
    const titleMatch = block.match(/Título:\s*(.+)/i);
    const descMatch = block.match(/Descripción:\s*([\s\S]+?)(?=\n\n|$)/i);

    if (titleMatch && descMatch) {
      const rawTitle = cleanCharCount(titleMatch[1].trim());
      const rawDesc = cleanCharCount(descMatch[1].trim().replace(/\n/g, " "));

      variants.push({
        title: truncateToLimit(rawTitle, TITLE_MAX_CHARS),
        description: truncateToLimit(rawDesc, DESC_MAX_CHARS),
      });
    }
  });

  if (variants.length === 0) {
    throw new Error("Formato de respuesta de IA inválido");
  }

  return variants;
}
