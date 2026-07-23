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

export type HeadingByPage = { url: string; headings: string[] };
export type HeadingTerm = { term: string; count: number };

export type TfidfResult = {
  terms: TfidfTerm[];
  topics: TopicGap[]; // H2/H3 del top-10 agrupados por cobertura
  headingsByPage: HeadingByPage[]; // encabezados completos por página
  headingTerms: HeadingTerm[]; // palabras más frecuentes en los encabezados
  sources: string[]; // URLs que se pudieron scrapear (corpus real usado)
  // Top-10 orgánico tal cual lo devuelve Google para la keyword: posición,
  // título, URL y snippet (description). Es el "cómo está posicionando la
  // competencia hoy" — ejemplo de copy accionable sin coste extra, porque
  // estos datos ya llegaban en el SERP que paga el rank tracking / TF-IDF.
  competitors: CompetitorSerp[];
};

// Una entrada del SERP del top-10 tal cual la ve Google. El snippet
// (description) es el dato de copy más reutilizable de todo el módulo.
export type CompetitorSerp = {
  url: string;
  title: string;
  position: number | null;
  description: string | null;
};

export type TopicGap = {
  text: string; // texto del encabezado tal cual aparece
  coverage: number; // nº de páginas del corpus que lo tienen
  urls: string[]; // qué URLs lo cubren
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
  // Top-10 tal cual lo devuelve Google: lo pasamos al resultado para que la UI
  // muestre "cómo posiciona la competencia" (título + snippet) sin coste
  // extra. Ordenamos por posición (rank_absolute) cuando exista; si no,
  // respetamos el orden del SERP que ya viene ordenado por relevancia.
  const competitors: CompetitorSerp[] = top
    .map((r) => ({
      url: r.url,
      title: r.title,
      position: r.position ?? null,
      description: r.description ?? null,
    }))
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99));

  // --- Fase 1: scraping del corpus (tolerante a fallos por página) ---
  const sources: string[] = [];
  const docs: Map<string, number>[] = []; // tf por documento: term → count
  const docFreq = new Map<string, number>(); // nº de docs que contienen el term
  // Headings por página (para el análisis de cobertura de temas).
  const headingsByUrl = new Map<string, Set<string>>();

  for (const { url } of top) {
    let page;
    try {
      page = await scrapePage(url);
    } catch (error) {
      if (error instanceof ScrapeError) continue;
      continue;
    }
    if (!page.bodyText.trim() && page.headings.length === 0) continue;

    // --- TF-IDF (bodyText) ---
    const bodyText = page.bodyText;
    const tf = new Map<string, number>();
    if (bodyText.trim()) {
      for (const gram of ngrams(tokenize(bodyText))) {
        tf.set(gram, (tf.get(gram) ?? 0) + 1);
      }
    }
    if (tf.size > 0) {
      docs.push(tf);
      for (const term of tf.keys()) {
        docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
      }
    }

    sources.push(url);

    // --- Cobertura de temas (H2/H3) ---
    const pageHeadings = new Set<string>();
    for (const h of page.headings) {
      const norm = h.text.trim();
      if (norm.length >= 3) pageHeadings.add(norm);
    }
    headingsByUrl.set(url, pageHeadings);
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

  // --- Fase 3: Cobertura de temas (H2/H3 del top-10) ---
  // Cada heading distinto → cuántas páginas lo cubren. Los que aparecen en
  // más páginas son los temas más comunes entre quienes ya posicionan.
  const topicMap = new Map<string, Set<string>>();
  for (const [url, headings] of headingsByUrl) {
    for (const h of headings) {
      if (!topicMap.has(h)) topicMap.set(h, new Set());
      topicMap.get(h)!.add(url);
    }
  }
  const topics: TopicGap[] = Array.from(topicMap.entries())
    .map(([text, urls]) => ({ text, coverage: urls.size, urls: [...urls] }))
    .sort((a, b) => b.coverage - a.coverage || a.text.localeCompare(b.text));

  // --- Fase 3: Encabezados completos por página + frecuencia de palabras ---
  const headingsByPage: HeadingByPage[] = Array.from(headingsByUrl.entries()).map(([url, hs]) => ({
    url,
    headings: [...hs],
  }));

  // Frecuencia de palabras en todos los encabezados (sin stop-words, 2+ car).
  const headingWordFreq = new Map<string, number>();
  for (const headings of headingsByUrl.values()) {
    for (const h of headings) {
      for (const tok of tokenize(h)) {
        if (isContentToken(tok)) {
          headingWordFreq.set(tok, (headingWordFreq.get(tok) ?? 0) + 1);
        }
      }
    }
  }
  const headingTerms: HeadingTerm[] = Array.from(headingWordFreq.entries())
    .map(([term, count]) => ({ term, count }))
    .filter((t) => t.count >= 2) // al menos 2 ocurrencias para ser relevante
    .sort((a, b) => b.count - a.count)
    .slice(0, 30);

  return { terms, topics, headingsByPage, headingTerms, sources, competitors };
}
