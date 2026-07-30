import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { assertWithinSpendLimit } from "@/lib/dataforseo/spend";
import { fetchInstantPageAnalysis } from "@/lib/onpage/dataforseo";
import { normalizeDomain } from "@/lib/competitors/dataforseo";
import { scrapePage } from "@/lib/seo/scrape";

// Guard de frescura de 7 días — mismo criterio que Competidores/Backlinks
// (src/lib/competitors/analyze.ts): analizar paga, ver el último análisis ya
// guardado es gratis. "Bloqueo estricto, sin override" (mismo criterio que el
// resto de la app).
const ONPAGE_FRESH_MS = 7 * 24 * 60 * 60 * 1000;

async function getFreshOnPageAnalysis(projectId: string, url: string) {
  const cutoff = new Date(Date.now() - ONPAGE_FRESH_MS);
  return prisma.onPageAnalysis.findFirst({
    where: { projectId, url, fetchedAt: { gt: cutoff } },
    orderBy: { fetchedAt: "desc" },
  });
}

// Recuento de frases, best-effort y GRATIS (reutiliza el scraper propio ya
// usado por TF-IDF/Título-Meta/Schema — sin llamada de pago adicional).
// DataForSEO no expone el texto plano en este endpoint, así que esto es lo
// único disponible para "frases" — null si el scraping estático no ve
// contenido (páginas que dependen de JS), nunca se inventa un número.
async function estimateSentenceCount(url: string): Promise<number | null> {
  try {
    const scraped = await scrapePage(url);
    const text = scraped.bodyText.trim();
    if (!text) return null;
    const sentences = text
      .split(/[.!?]+(?:\s+|$)/)
      .map((s) => s.trim())
      .filter((s) => s.split(/\s+/).filter(Boolean).length >= 2); // descarta fragmentos/abreviaturas sueltas
    return sentences.length > 0 ? sentences.length : null;
  } catch {
    return null;
  }
}

export async function analyzeOnPage(
  projectId: string,
  url: string
): Promise<{
  analysis: Awaited<ReturnType<typeof prisma.onPageAnalysis.create>>;
  fromCache: boolean;
}> {
  const existing = await getFreshOnPageAnalysis(projectId, url);
  if (existing) return { analysis: existing, fromCache: true };

  await assertWithinSpendLimit(projectId);

  const [result, sentenceCount] = await Promise.all([
    fetchInstantPageAnalysis(url),
    estimateSentenceCount(url),
  ]);

  const domain = normalizeDomain(url);

  const analysis = await prisma.onPageAnalysis.create({
    data: {
      projectId,
      url,
      domain,
      onPageScore: result.onPageScore,
      wordCount: result.wordCount,
      characterCount: result.characterCount,
      sentenceCount,
      titleLength: result.titleLength,
      descriptionLength: result.descriptionLength,
      htags: (result.htags ?? undefined) as unknown as Prisma.InputJsonValue,
      issues: result.issues as unknown as Prisma.InputJsonValue,
      readability: (result.readability ?? undefined) as unknown as Prisma.InputJsonValue,
      imagesCount: result.imagesCount,
      internalLinksCount: result.internalLinksCount,
      externalLinksCount: result.externalLinksCount,
      hasBrokenLinks: result.hasBrokenLinks,
    },
  });

  if (result.costUsd !== null) {
    await prisma.apiUsageLog.create({
      data: { projectId, api: "dataforseo", endpoint: "onpage.instant_pages", model: null, costUsd: result.costUsd },
    });
  }

  return { analysis, fromCache: false };
}
