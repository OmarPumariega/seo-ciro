import type { ScrapedPage } from "@/lib/seo/scrape";
import type { StoredTfidfResult } from "@/lib/tfidf/get-or-compute";

// "Optimizar URL existente" (Módulo 7) — a diferencia de buildSystemPrompt/
// buildUserMessage (content.ts, que generan texto nuevo de cero), aquí el LLM
// compara una página YA PUBLICADA contra lo que la herramienta ya sabe del
// SERP (TF-IDF), de los competidores (content gap) y del propio estudio de
// keywords, y devuelve una lista de cambios concretos — nunca un texto
// reescrito completo.

export type OptimizationSuggestion = {
  type: "titulo" | "meta" | "h1" | "encabezado" | "contenido";
  location: string;
  current: string | null;
  recommended: string;
  reason: string;
};

export type GapKeyword = {
  keyword: string;
  volume: number | null;
  difficulty: number | null;
};

export type StudyKeyword = {
  keyword: string;
  searchVolume: number | null;
  priority: number;
};

export const OPTIMIZE_SYSTEM_PROMPT = `Eres un consultor SEO senior de una agencia de marketing digital, en español.
Tu tarea es AUDITAR una página ya publicada y proponer cambios concretos, no reescribirla entera.

Devuelve EXCLUSIVAMENTE un JSON válido (sin markdown, sin \`\`\`, sin texto antes o después) con esta forma exacta:
{"suggestions": [{"type": "titulo"|"meta"|"h1"|"encabezado"|"contenido", "location": "string describiendo qué parte de la página", "current": "texto actual o null si es contenido nuevo a añadir", "recommended": "texto o cambio recomendado", "reason": "por qué, basado en los datos reales que se te dan"}]}

REGLAS CRÍTICAS:
- Basa cada sugerencia en los datos reales proporcionados (términos TF-IDF del top-10, keywords de competidores, posición actual) — nunca inventes datos, cifras o afirmaciones sin respaldo en lo que se te ha dado.
- Prioriza cambios de alto impacto: título/meta/H1 sin la keyword principal, encabezados temáticos ausentes que sí cubre el top-10, términos relevantes del TF-IDF no mencionados en el texto.
- Máximo 12 sugerencias, ordenadas de más a menos importante.
- Si la página ya cubre bien un aspecto, no generes una sugerencia sobre eso — mejor pocas sugerencias accionables que muchas triviales.`;

export function buildOptimizationUserMessage(params: {
  url: string;
  targetKeyword: string;
  rankPosition: number | null;
  scraped: ScrapedPage;
  tfidf: StoredTfidfResult | null;
  gapKeywords: GapKeyword[];
  studyKeywords: StudyKeyword[];
}): string {
  const { url, targetKeyword, rankPosition, scraped, tfidf, gapKeywords, studyKeywords } = params;

  const lines: string[] = [];
  lines.push(`URL a optimizar: ${url}`);
  lines.push(`Keyword objetivo: ${targetKeyword}`);
  lines.push(`Posición actual en Google: ${rankPosition !== null ? rankPosition : "no está en el top del rango trackeado, o sin trackear"}`);

  lines.push("\n--- CONTENIDO ACTUAL DE LA PÁGINA ---");
  lines.push(`Título (<title>): ${scraped.title || "(vacío)"}`);
  lines.push(`Meta descripción: ${scraped.metaDescription || "(vacía)"}`);
  lines.push(`H1: ${scraped.h1 || "(vacío)"}`);
  if (scraped.headings.length > 0) {
    lines.push("Encabezados H2/H3:");
    for (const h of scraped.headings) lines.push(`  ${h.tag.toUpperCase()}: ${h.text}`);
  } else {
    lines.push("Encabezados H2/H3: (ninguno)");
  }
  lines.push(`Texto del cuerpo (extracto): ${scraped.bodyText.slice(0, 2000) || "(vacío)"}`);

  if (tfidf) {
    lines.push("\n--- CÓMO POSICIONA EL TOP-10 DE GOOGLE PARA ESTA KEYWORD ---");
    if (tfidf.terms.length > 0) {
      lines.push(`Términos más distintivos (TF-IDF): ${tfidf.terms.slice(0, 20).map((t) => t.term).join(", ")}`);
    }
    if (tfidf.topics.length > 0) {
      lines.push(
        `Temas/encabezados que cubre el top-10 (con cobertura): ${tfidf.topics
          .slice(0, 20)
          .map((t) => `"${t.text}" (${t.coverage} páginas)`)
          .join("; ")}`
      );
    }
  } else {
    lines.push("\n--- Sin datos TF-IDF disponibles para esta keyword ---");
  }

  if (gapKeywords.length > 0) {
    lines.push("\n--- KEYWORDS QUE POSICIONAN LOS COMPETIDORES Y ESTA PÁGINA NO CUBRE ---");
    for (const k of gapKeywords.slice(0, 20)) {
      lines.push(`  ${k.keyword} (volumen: ${k.volume ?? "?"}, dificultad: ${k.difficulty ?? "?"})`);
    }
  }

  if (studyKeywords.length > 0) {
    lines.push("\n--- OTRAS KEYWORDS RELEVANTES DEL PROYECTO (estudio General) ---");
    for (const k of studyKeywords.slice(0, 20)) {
      lines.push(`  ${k.keyword} (volumen: ${k.searchVolume ?? "?"}, prioridad: ${k.priority})`);
    }
  }

  return lines.join("\n");
}
