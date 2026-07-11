import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { crawlSite, type CrawledPage } from "@/lib/audit/crawler";
import { getPsiMetrics } from "@/lib/audit/psi";
import { crossReferenceGsc } from "@/lib/audit/gsc-crossref";
import { computeScore } from "@/lib/audit/scoring";

const STALE_RUN_TIMEOUT_MIN = 30;

function buildIssues(page: CrawledPage, inSearchConsole: boolean | null): string[] {
  const issues: string[] = [];
  if (!page.canonicalUrl) issues.push("missing_canonical");
  if (page.metaRobots?.toLowerCase().includes("noindex")) issues.push("noindex");
  if (!page.isHttps) issues.push("no_https");
  if (page.brokenLinksCount > 0) issues.push("broken_links");
  if (page.imagesMissingAlt > 0) issues.push("missing_alt");
  if (inSearchConsole === false) issues.push("no_gsc_impressions");
  return issues;
}

// Una auditoría "running" cuyo startedAt lleva demasiado tiempo (despliegue
// a mitad de crawl, proceso reiniciado...) se marca failed en vez de
// quedarse colgada para siempre en la UI.
async function recoverStaleRuns() {
  const cutoff = new Date(Date.now() - STALE_RUN_TIMEOUT_MIN * 60 * 1000);
  await prisma.auditRun.updateMany({
    where: { status: "running", startedAt: { lt: cutoff } },
    data: {
      status: "failed",
      errorMessage: "Auditoría interrumpida (timeout)",
      completedAt: new Date(),
    },
  });
}

export async function runAuditJob(): Promise<{ processed: number }> {
  await recoverStaleRuns();

  const run = await prisma.auditRun.findFirst({
    where: { status: "pending" },
    orderBy: { triggeredAt: "asc" },
    include: { project: true },
  });

  if (!run) return { processed: 0 };

  await prisma.auditRun.update({
    where: { id: run.id },
    data: { status: "running", startedAt: new Date() },
  });

  try {
    const crawl = await crawlSite(run.startUrl);

    if (crawl.robotsBlocked) {
      await prisma.auditRun.update({
        where: { id: run.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          robotsBlocked: true,
          pagesCrawled: 0,
          sitemapFound: crawl.sitemapFound,
        },
      });
      return { processed: 1 };
    }

    const [psi, impressedUrls] = await Promise.all([
      getPsiMetrics(run.startUrl).catch(() => null),
      crossReferenceGsc(run.project.gscSiteUrl).catch(() => null),
    ]);

    const gscChecked = impressedUrls !== null;

    const { overallScore, categoryScores } = computeScore(
      crawl.pages,
      { sitemapFound: crawl.sitemapFound },
      psi
    );

    await prisma.$transaction([
      prisma.auditPage.createMany({
        data: crawl.pages.map((page) => {
          const inSearchConsole = gscChecked ? (impressedUrls as Set<string>).has(page.url) : null;
          return {
            auditRunId: run.id,
            url: page.url,
            statusCode: page.statusCode,
            isHttps: page.isHttps,
            canonicalUrl: page.canonicalUrl,
            metaRobots: page.metaRobots,
            imagesTotal: page.imagesTotal,
            imagesMissingAlt: page.imagesMissingAlt,
            brokenLinksCount: page.brokenLinksCount,
            brokenLinksSample: page.brokenLinksSample as Prisma.InputJsonValue,
            inSearchConsole,
            issues: buildIssues(page, inSearchConsole) as Prisma.InputJsonValue,
          };
        }),
      }),
      prisma.auditRun.update({
        where: { id: run.id },
        data: {
          status: "completed",
          completedAt: new Date(),
          pagesCrawled: crawl.pages.length,
          sitemapFound: crawl.sitemapFound,
          overallScore,
          categoryScores: categoryScores as unknown as Prisma.InputJsonValue,
          psiData: psi ? (psi as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
          gscChecked,
        },
      }),
    ]);

    return { processed: 1 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    await prisma.auditRun.update({
      where: { id: run.id },
      data: { status: "failed", completedAt: new Date(), errorMessage: message },
    });
    return { processed: 1 };
  }
}
