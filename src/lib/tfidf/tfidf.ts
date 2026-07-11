import { scrapePage, ScrapeError } from "@/lib/seo/scrape";
import { type SerpTopResult } from "./serp";

// TF-IDF / prominencia semántica. Para una keyword dada, se scrapean las top
// páginas orgánicas de Google, se tokeniza su cuerpo de texto y se calculan
// los unigramas y bigramas más distintivos del corpus. Esos términos son los
// que debería incluir un contenido nuevo para "hablar el mismo idioma" que las
// páginas que ya posicionan.

// Stop-words mínimas del español. Lista corta y deliberada: el objetivo es
// limpiar ruido estructural del idioma sin perder términos con valor
// semántico. TF-IDF ya devalúa naturalmente las palabras demasiado comunes
// (aparecen en todos los documentos → IDF bajo), pero filtrar las más
// frecuentes evita que dominen el top por pura frecuencia absoluta.
const STOP_WORDS = new Set([
  "de", "la", "que", "el", "en", "y", "a", "los", "del", "las", "por", "un",
  "para", "con", "una", "su", "al", "lo", "mas", "o", "se",
]);

export type TfidfTerm = {
  term: string;
  tfidf: number;
  docs: number; // nº de documentos del corpus en los que aparece
};

export type TfidfResult = {
  terms: TfidfTerm[];
  sources: string[]; // URLs que se pudieron scrapear (corpus real usado)
};

// Normaliza el texto a tokens: minúsculas, sin acentos ni signos, split por
// palabras de 2+ caracteres. Devuelve tokens individuales (sin filtrar aún
// stop-words: el filtrado se hace donde se consume, para que los bigramas
// puedan decidir si conservan o no una stop-word intermedia).
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // quita acentos
    .replace(/[^a-z0-9\s]/g, " ") // solo letras/números
    .split(/\s+/)
    .filter((w) => w.length >= 2);
}

function isContentToken(w: string): boolean {
  return w.length >= 2 && !STOP_WORDS.has(w);
}

// Construye los n-gramas (1 y 2) de una secuencia de tokens. Para los
// bigramas se exige que AMBOS componentes sean tokens de contenido (no
// stop-words): así "marketing digital" sube, pero "de marketing" se descarta.
function ngrams(tokens: string[]): string[] {
  const grams: string[] = [];
  for (const t of tokens) {
    if (isContentToken(t)) grams.push(t);
  }
  for (let i = 0; i < tokens.length - 1; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (isContentToken(a) && isContentToken(b)) {
      grams.push(`${a} ${b}`);
    }
  }
  return grams;
}

export async function computeTfidf(top: SerpTopResult[]): Promise<TfidfResult> {
  // --- Fase 1: scraping del corpus (tolerante a fallos por página) ---
  const sources: string[] = [];
  const docs: Map<string, number>[] = []; // tf por documento: term → count
  const docFreq = new Map<string, number>(); // nº de docs que contienen el term

  for (const { url } of top) {
    let bodyText: string;
    try {
      const page = await scrapePage(url);
      bodyText = page.bodyText;
    } catch (error) {
      // Una página que no se pueda scrapear (timeout, JS, 403...) no tira el
      // análisis: se omite y se sigue con el resto del corpus.
      if (error instanceof ScrapeError) continue;
      continue;
    }
    if (!bodyText.trim()) continue;

    const tf = new Map<string, number>();
    for (const gram of ngrams(tokenize(bodyText))) {
      tf.set(gram, (tf.get(gram) ?? 0) + 1);
    }
    if (tf.size === 0) continue;

    docs.push(tf);
    sources.push(url);
    for (const term of tf.keys()) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  const n = docs.length;

  // --- Fase 2: TF-IDF ---
  // TF suavizado (1 + log10(tf)) para que un término repetido 50 veces no
  // aplaste al que aparece 5. IDF = log10(N / df) — clásico, devalúa los
  // términos que aparecen en casi todos los documentos.
  const scored = new Map<string, { tfidf: number; docs: number }>();
  for (const tf of docs) {
    for (const [term, count] of tf) {
      const df = docFreq.get(term) ?? 1;
      const idf = Math.log10(n / df);
      if (idf <= 0) continue; // término presente en todos los docs → sin valor discriminatorio
      const tfidf = (1 + Math.log10(count)) * idf;
      const prev = scored.get(term);
      if (!prev || tfidf > prev.tfidf) {
        scored.set(term, { tfidf, docs: df });
      }
    }
  }

  const terms: TfidfTerm[] = Array.from(scored.entries())
    .map(([term, v]) => ({ term, tfidf: Number(v.tfidf.toFixed(4)), docs: v.docs }))
    .sort((a, b) => b.tfidf - a.tfidf)
    .slice(0, 20);

  return { terms, sources };
}
