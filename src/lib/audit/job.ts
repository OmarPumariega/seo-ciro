import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { crawlSite, type CrawledPage } from "@/lib/audit/crawler";
import { getPsiMetrics } from "@/lib/audit/psi";
import { crossReferenceGsc } from "@/lib/audit/gsc-crossref";
import { computeScore } from "@/lib/audit/scoring";
import { notify } from "@/lib/notifications/notify";

const STALE_RUN_TIMEOUT_MIN = 30;
const MONTHLY_AUDIT_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;
const THIN_CONTENT_WORDS = 300; // bajo este nº de palabras → thin content

function buildIssues(page: CrawledPage, inSearchConsole: boolean | null): string[] {
  const issues: string[] = [];
  // Indexabilidad
  if (!page.canonicalUrl) issues.push("missing_canonical");
  if (page.metaRobots?.toLowerCase().includes("noindex")) issues.push("noindex");
  if (!page.isHttps) issues.push("no_https");
  if (page.isRedirect) issues.push("redirect");
  // Enlaces
  if (page.brokenLinksCount > 0) issues.push("broken_links");
  // Imágenes
  if (page.imagesMissingAlt > 0) issues.push("missing_alt");
  // Thin content
  if (page.wordCount !== null && page.wordCount < THIN_CONTENT_WORDS) issues.push("thin_content");
  // On-page: title
  if (!page.title) issues.push("missing_title");
  else {
    if (page.titleLength !== null && page.titleLength > 65) issues.push("title_long");
    if (page.titleLength !== null && page.titleLength < 30) issues.push("title_short");
  }
  // On-page: meta description
  if (!page.metaDescription) issues.push("missing_meta");
  else {
    if (page.metaLength !== null && page.metaLength > 160) issues.push("meta_long");
    if (page.metaLength !== null && page.metaLength < 120) issues.push("meta_short");
  }
  // On-page: H1
  if (page.h1Count === 0) issues.push("missing_h1");
  if (page.h1Count !== null && page.h1Count > 1) issues.push("multiple_h1");
  // GSC
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

// Scheduling mensual: si un proyecto con auditFrequency="monthly" lleva 30+
// días sin auditarse (o nunca se ha auditado), el cron le crea una AuditRun
// pending que procesará la lógica de runAuditJob abajo. Como mucho 1 proyecto
// por tick del cron, para no disparar varios crawls a la vez. El filtro
// `auditRuns: { none }` excluye los que ya tienen una run pendiente o en curso
// (disparada a mano o por un tick anterior) y así no se duplica. Mismo patrón
// "findMany candidatos + orderBy lastRun asc" que runRankJob (Módulo 5).
async function scheduleMonthlyAudit() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - MONTHLY_AUDIT_INTERVAL_MS);

  const candidate = await prisma.project.findFirst({
    where: {
      auditFrequency: "monthly",
      domain: { not: null },
      OR: [{ auditLastRunAt: null }, { auditLastRunAt: { lt: cutoff } }],
      auditRuns: { none: { status: { in: ["pending", "running"] } } },
    },
    orderBy: { auditLastRunAt: "asc" },
  });

  if (!candidate || !candidate.domain) return;

  // Marcar auditLastRunAt ya (no al procesar) para que el siguiente tick no
  // vuelva a seleccionar este proyecto si la run tarda en arrancar.
  await prisma.$transaction([
    prisma.auditRun.create({
      data: {
        projectId: candidate.id,
        startUrl: `https://${candidate.domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`,
      },
    }),
    prisma.project.update({
      where: { id: candidate.id },
      data: { auditLastRunAt: now },
    }),
  ]);
}

export async function runAuditJob(): Promise<{ processed: number }> {
  await recoverStaleRuns();
  await scheduleMonthlyAudit();

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
    // PSI y GSC son independientes del crawl — arrancan en paralelo para no
    // sumar su latencia (PSI solo: 5-15s) al final del job. Si robots bloquea
    // el rastreo, el resultado de PSI simplemente se descarta.
    const psiPromise = getPsiMetrics(run.startUrl).catch(() => null);
    const gscPromise = crossReferenceGsc(run.project.gscSiteUrl).catch(() => null);

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
      await notify({
        type: "audit_completed",
        key: run.id,
        subject: `Auditoría completada — ${run.project.name}`,
        body: `La auditoría de ${run.project.name} (${run.project.domain ?? "sin dominio"}) no pudo completarse: el robots.txt bloquea el rastreo. Revísalo en el panel.`,
      });
      return { processed: 1 };
    }

    const [psi, impressedUrls] = await Promise.all([psiPromise, gscPromise]);

    const gscChecked = impressedUrls !== null;

    const { overallScore, categoryScores } = computeScore(
      crawl.pages,
      { sitemapFound: crawl.sitemapFound },
      psi
    );

    // Detección de duplicados (cross-page): títulos y metas repetidos.
    const titleCounts = new Map<string, number>();
    const metaCounts = new Map<string, number>();
    for (const p of crawl.pages) {
      const t = p.title?.toLowerCase().trim();
      if (t) titleCounts.set(t, (titleCounts.get(t) ?? 0) + 1);
      const m = p.metaDescription?.toLowerCase().trim();
      if (m) metaCounts.set(m, (metaCounts.get(m) ?? 0) + 1);
    }

    await prisma.$transaction([
      prisma.auditPage.createMany({
        data: crawl.pages.map((page) => {
          const inSearchConsole = gscChecked ? (impressedUrls as Set<string>).has(page.url) : null;
          const issues = buildIssues(page, inSearchConsole);
          // Marca duplicados (título/meta repetidos entre páginas).
          const tl = page.title?.toLowerCase().trim();
          if (tl && (titleCounts.get(tl) ?? 0) > 1) issues.push("duplicate_title");
          const ml = page.metaDescription?.toLowerCase().trim();
          if (ml && (metaCounts.get(ml) ?? 0) > 1) issues.push("duplicate_meta");
          return {
            auditRunId: run.id,
            url: page.url,
            statusCode: page.statusCode,
            isHttps: page.isHttps,
            isRedirect: page.isRedirect,
            canonicalUrl: page.canonicalUrl,
            metaRobots: page.metaRobots,
            title: page.title,
            titleLength: page.titleLength,
            metaDescription: page.metaDescription,
            metaLength: page.metaLength,
            h1Count: page.h1Count,
            h1Text: page.h1Text,
            imagesTotal: page.imagesTotal,
            imagesMissingAlt: page.imagesMissingAlt,
            brokenLinksCount: page.brokenLinksCount,
            brokenLinksSample: page.brokenLinksSample as Prisma.InputJsonValue,
            wordCount: page.wordCount,
            externalLinksCount: page.externalLinksCount,
            externalDomains: page.externalDomains as Prisma.InputJsonValue,
            inSearchConsole,
            issues: issues as Prisma.InputJsonValue,
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
          linkGraph: crawl.linkGraph as unknown as Prisma.InputJsonValue,
          robotsContent: crawl.robotsContent,
          sitemapUrlCount: crawl.sitemapUrlCount,
          sitemapUrls: crawl.sitemapUrls as unknown as Prisma.InputJsonValue,
        },
      }),
    ]);

    await notify({
      type: "audit_completed",
      key: run.id,
      subject: `Auditoría completada — ${run.project.name} (${overallScore}/100)`,
      body: `La auditoría de ${run.project.name} (${run.project.domain ?? "sin dominio"}) ha terminado con una puntuación de ${overallScore}/100 sobre ${crawl.pages.length} páginas rastreadas. Detalle en el panel: /admin/proyectos/${run.projectId}/auditoria`,
    });

    return { processed: 1 };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    await prisma.auditRun.update({
      where: { id: run.id },
      data: { status: "failed", completedAt: new Date(), errorMessage: message },
    });
    await notify({
      type: "audit_failed",
      key: run.id,
      subject: `Auditoría fallida — ${run.project.name}`,
      body: `La auditoría de ${run.project.name} ha fallado: ${message}. Revísalo en el panel: /admin/proyectos/${run.projectId}/auditoria`,
    });
    return { processed: 1 };
  }
}
