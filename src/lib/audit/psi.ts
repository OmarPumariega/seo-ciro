import { getSetting } from "@/lib/settings";

export type PsiCategoryScores = {
  performance: number | null; // 0-1
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
};

// Hallazgos accionables reales de Lighthouse — antes se leían solo 3 números
// (LCP/CLS/INP) de las decenas de `audits` que trae la misma respuesta ya
// pagada/consumida de cuota. Lista curada de IDs estables de Lighthouse; los
// que no aparezcan en la respuesta simplemente se omiten (defensivo, no todos
// los audits aplican a toda página).
const OPPORTUNITY_AUDIT_IDS = [
  "render-blocking-resources",
  "unused-css-rules",
  "unused-javascript",
  "modern-image-formats",
  "uses-optimized-images",
  "uses-text-compression",
  "total-byte-weight",
  "server-response-time",
  "largest-contentful-paint-element",
  "unminified-css",
  "unminified-javascript",
] as const;

export type PsiOpportunity = {
  id: string;
  title: string;
  description: string;
  displayValue: string | null;
  score: number | null; // 0-1, cuanto más bajo peor
};

export type PsiFieldMetric = { percentile: number | null; category: string | null };

// Datos REALES de usuarios (Chrome UX Report), no simulación de laboratorio —
// antes nunca se leían pese a venir en la misma respuesta. Es la señal que
// Google realmente usa como ranking factor (Core Web Vitals de campo, no de
// lab). Null si la URL/origen no tiene cobertura CrUX suficiente (tráfico
// bajo) — no es un fallo, es un estado real y frecuente.
export type PsiFieldData = {
  overallCategory: string | null;
  lcp: PsiFieldMetric | null;
  cls: PsiFieldMetric | null;
  inp: PsiFieldMetric | null;
  ttfb: PsiFieldMetric | null;
  source: "page" | "origin"; // loadingExperience (la URL) u originLoadingExperience (todo el dominio)
};

export type PsiResult = {
  scores: PsiCategoryScores;
  lcpMs: number | null; // lab (Lighthouse, simulado)
  cls: number | null; // lab
  inpMs: number | null; // lab
  opportunities: PsiOpportunity[];
  fieldData: PsiFieldData | null;
};

function parseFieldData(raw: unknown, source: "page" | "origin"): PsiFieldData | null {
  const le = raw as Record<string, unknown> | undefined;
  if (!le || typeof le !== "object") return null;
  const metrics = (le.metrics ?? {}) as Record<string, unknown>;
  const overallCategory = typeof le.overall_category === "string" ? le.overall_category : null;
  if (overallCategory === "NONE" && Object.keys(metrics).length === 0) return null;

  function metric(key: string): PsiFieldMetric | null {
    const m = metrics[key] as Record<string, unknown> | undefined;
    if (!m) return null;
    return {
      percentile: typeof m.percentile === "number" ? m.percentile : null,
      category: typeof m.category === "string" ? m.category : null,
    };
  }

  return {
    overallCategory,
    lcp: metric("LARGEST_CONTENTFUL_PAINT_MS"),
    cls: metric("CUMULATIVE_LAYOUT_SHIFT_SCORE"),
    inp: metric("INTERACTION_TO_NEXT_PAINT") ?? metric("FIRST_INPUT_DELAY_MS"),
    ttfb: metric("EXPERIMENTAL_TIME_TO_FIRST_BYTE"),
    source,
  };
}

// PageSpeed Insights solo se consulta sobre la home del proyecto, no por
// página rastreada — cada llamada tarda varios segundos, auditar cada
// página del crawl sería impracticable en un job de fondo. Devuelve null
// si falta la API key o falla la llamada, sin cortar el resto de la
// auditoría (igual que el patrón de degradación de GoogleView.tsx).
export async function getPsiMetrics(url: string): Promise<PsiResult | null> {
  const apiKey = await getSetting("PAGESPEED_API_KEY");
  if (!apiKey) return null;

  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", url);
  endpoint.searchParams.set("key", apiKey);
  // Las 4 categorías de Lighthouse en la MISMA llamada — antes solo se pedía
  // "performance"; accessibility/best-practices/seo llegan gratis (mismo
  // coste de cuota) y encajan directamente con lo que esta herramienta ya
  // vende como propuesta de valor SEO.
  for (const category of ["performance", "accessibility", "best-practices", "seo"]) {
    endpoint.searchParams.append("category", category);
  }
  endpoint.searchParams.set("strategy", "mobile");

  try {
    const res = await fetch(endpoint.toString(), { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;

    const data = await res.json();
    const categories = data?.lighthouseResult?.categories ?? {};
    const performanceScore = categories?.performance?.score;
    if (typeof performanceScore !== "number") return null;

    const scores: PsiCategoryScores = {
      performance: performanceScore,
      accessibility: typeof categories?.accessibility?.score === "number" ? categories.accessibility.score : null,
      bestPractices:
        typeof categories?.["best-practices"]?.score === "number" ? categories["best-practices"].score : null,
      seo: typeof categories?.seo?.score === "number" ? categories.seo.score : null,
    };

    const audits = data?.lighthouseResult?.audits ?? {};
    const lcpMs =
      typeof audits["largest-contentful-paint"]?.numericValue === "number"
        ? audits["largest-contentful-paint"].numericValue
        : null;
    const cls =
      typeof audits["cumulative-layout-shift"]?.numericValue === "number"
        ? audits["cumulative-layout-shift"].numericValue
        : null;
    const inpMs =
      typeof audits["interaction-to-next-paint"]?.numericValue === "number"
        ? audits["interaction-to-next-paint"].numericValue
        : null;

    const opportunities: PsiOpportunity[] = [];
    for (const id of OPPORTUNITY_AUDIT_IDS) {
      const audit = audits[id] as Record<string, unknown> | undefined;
      if (!audit) continue;
      const score = typeof audit.score === "number" ? audit.score : null;
      // Solo hallazgos reales (score < 1 = oportunidad); score null = audit
      // no aplicable/"not applicable" en Lighthouse, se omite.
      if (score === null || score >= 1) continue;
      const title = typeof audit.title === "string" ? audit.title : id;
      const description = typeof audit.description === "string" ? audit.description : "";
      const displayValue = typeof audit.displayValue === "string" ? audit.displayValue : null;
      opportunities.push({ id, title, description, displayValue, score });
    }
    // Peor primero (score más bajo = oportunidad más grande).
    opportunities.sort((a, b) => (a.score ?? 1) - (b.score ?? 1));

    const fieldData =
      parseFieldData(data?.loadingExperience, "page") ?? parseFieldData(data?.originLoadingExperience, "origin");

    return { scores, lcpMs, cls, inpMs, opportunities, fieldData };
  } catch {
    return null;
  }
}
