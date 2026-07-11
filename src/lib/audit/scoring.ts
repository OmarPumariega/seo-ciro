import type { CrawledPage } from "@/lib/audit/crawler";
import type { PsiResult } from "@/lib/audit/psi";

export type CategoryScore = {
  score: number;
  max: number;
  detail: Record<string, number>;
};

export type CategoryScores = {
  indexabilidad: CategoryScore;
  enlaces: CategoryScore;
  onpage: CategoryScore;
  rendimiento: CategoryScore | null;
  accesibilidadImagenes: CategoryScore;
};

export type ScoreResult = {
  overallScore: number;
  categoryScores: CategoryScores;
};

const WEIGHTS = {
  indexabilidad: 25,
  enlaces: 20,
  onpage: 20,
  rendimiento: 25,
  accesibilidadImagenes: 10,
};

// Pura, sin I/O — cada categoría guarda el detalle numérico usado para la
// deducción, para que la puntuación sea auditable a mano y no una caja negra.
export function computeScore(
  pages: CrawledPage[],
  siteChecks: { sitemapFound: boolean },
  psi: PsiResult | null
): ScoreResult {
  const crawled = pages.length;
  const homepage = pages[0];

  // Indexabilidad
  const httpsOk = homepage ? homepage.isHttps : true;
  const sinCanonical = pages.filter((p) => !p.canonicalUrl).length;
  const noindexPages = pages.filter((p) => p.metaRobots?.toLowerCase().includes("noindex")).length;

  let indexScore = WEIGHTS.indexabilidad;
  if (!httpsOk) indexScore -= 15;
  if (!siteChecks.sitemapFound) indexScore -= 5;
  if (crawled > 0) {
    indexScore -= 8 * (sinCanonical / crawled);
    indexScore -= 7 * (noindexPages / crawled);
  }
  indexScore = Math.max(0, Math.round(indexScore));

  const indexabilidad: CategoryScore = {
    score: indexScore,
    max: WEIGHTS.indexabilidad,
    detail: {
      httpsOk: httpsOk ? 1 : 0,
      sitemapFound: siteChecks.sitemapFound ? 1 : 0,
      sinCanonical,
      noindexPages,
      paginasRastreadas: crawled,
    },
  };

  // Enlaces
  const enlacesComprobados = pages.reduce((sum, p) => sum + p.linksCheckedCount, 0);
  const enlacesRotos = pages.reduce((sum, p) => sum + p.brokenLinksCount, 0);
  const enlacesScore =
    enlacesComprobados > 0
      ? Math.max(0, Math.round(WEIGHTS.enlaces * (1 - enlacesRotos / enlacesComprobados)))
      : WEIGHTS.enlaces;

  const enlaces: CategoryScore = {
    score: enlacesScore,
    max: WEIGHTS.enlaces,
    detail: { enlacesRotos, enlacesComprobados },
  };

  // On-page (títulos, meta descriptions, H1) — tipo Screaming Frog.
  const paginasConIssuesOnPage = pages.filter((p) => {
    return !p.title ||
      (p.titleLength !== null && (p.titleLength < 30 || p.titleLength > 65)) ||
      !p.metaDescription ||
      (p.metaLength !== null && (p.metaLength < 120 || p.metaLength > 160)) ||
      p.h1Count === 0 ||
      (p.h1Count !== null && p.h1Count > 1);
  }).length;
  const onpageScore = crawled > 0
    ? Math.max(0, Math.round(WEIGHTS.onpage * (1 - paginasConIssuesOnPage / crawled)))
    : WEIGHTS.onpage;
  const onpage: CategoryScore = {
    score: onpageScore,
    max: WEIGHTS.onpage,
    detail: { paginasConIssuesOnPage, paginasRastreadas: crawled },
  };

  // Rendimiento — solo si hay dato de PSI (home). Si no, la categoría queda
  // null y el overall se renormaliza sobre las otras 3 en vez de contar como 0.
  const rendimiento: CategoryScore | null = psi
    ? {
        score: Math.round(WEIGHTS.rendimiento * psi.performanceScore),
        max: WEIGHTS.rendimiento,
        detail: {
          performanceScorePct: Math.round(psi.performanceScore * 100),
          lcpMs: psi.lcpMs ?? -1,
          clsX1000: psi.cls !== null ? Math.round(psi.cls * 1000) : -1,
          inpMs: psi.inpMs ?? -1,
        },
      }
    : null;

  // Accesibilidad de imágenes
  const imagesTotal = pages.reduce((sum, p) => sum + p.imagesTotal, 0);
  const imagesMissingAlt = pages.reduce((sum, p) => sum + p.imagesMissingAlt, 0);
  const accesibilidadScore =
    imagesTotal > 0
      ? Math.max(
          0,
          Math.round(WEIGHTS.accesibilidadImagenes * (1 - imagesMissingAlt / imagesTotal))
        )
      : WEIGHTS.accesibilidadImagenes; // sin imágenes → no se penaliza

  const accesibilidadImagenes: CategoryScore = {
    score: accesibilidadScore,
    max: WEIGHTS.accesibilidadImagenes,
    detail: { imagesTotal, imagesMissingAlt },
  };

  const categoryScores: CategoryScores = {
    indexabilidad,
    enlaces,
    onpage,
    rendimiento,
    accesibilidadImagenes,
  };

  const sumaConDatos =
    indexabilidad.score + enlaces.score + onpage.score + accesibilidadImagenes.score + (rendimiento?.score ?? 0);
  const maxConDatos =
    indexabilidad.max + enlaces.max + onpage.max + accesibilidadImagenes.max + (rendimiento?.max ?? 0);

  const overallScore = maxConDatos > 0 ? Math.round((sumaConDatos / maxConDatos) * 100) : 0;

  return { overallScore, categoryScores };
}
