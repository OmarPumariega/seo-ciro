import { getSetting } from "@/lib/settings";

export type PsiResult = {
  performanceScore: number; // 0-1
  lcpMs: number | null;
  cls: number | null;
  inpMs: number | null;
};

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
  endpoint.searchParams.set("category", "performance");
  endpoint.searchParams.set("strategy", "mobile");

  try {
    const res = await fetch(endpoint.toString(), { signal: AbortSignal.timeout(30000) });
    if (!res.ok) return null;

    const data = await res.json();
    const performanceScore = data?.lighthouseResult?.categories?.performance?.score;
    if (typeof performanceScore !== "number") return null;

    const audits = data?.lighthouseResult?.audits ?? {};
    const lcpMs = typeof audits["largest-contentful-paint"]?.numericValue === "number"
      ? audits["largest-contentful-paint"].numericValue
      : null;
    const cls = typeof audits["cumulative-layout-shift"]?.numericValue === "number"
      ? audits["cumulative-layout-shift"].numericValue
      : null;
    const inpMs = typeof audits["interaction-to-next-paint"]?.numericValue === "number"
      ? audits["interaction-to-next-paint"].numericValue
      : null;

    return { performanceScore, lcpMs, cls, inpMs };
  } catch {
    return null;
  }
}
