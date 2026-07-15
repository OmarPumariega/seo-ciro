import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import InformeBuilder, { type ReportData, type CategoryScores, type TopKeyword } from "./InformeBuilder";
import { Prisma } from "@prisma/client";
import { computePageRank, type LinkNode } from "@/lib/links/pagerank";
import { normalizeReportConfig } from "@/lib/informe/sections";
import { getGoogleClient, GoogleNotConnectedError } from "@/lib/google/client";
import { listCannibalizations } from "@/lib/google/search-console";
import { normalizeDomain } from "@/lib/competitors/dataforseo";

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Valida que el `linkGraph` (Json?) tenga la forma esperada por el crawler.
function parseLinkGraph(raw: unknown): LinkNode[] {
  if (!Array.isArray(raw)) return [];
  const nodes: LinkNode[] = [];
  for (const entry of raw) {
    if (
      entry &&
      typeof entry === "object" &&
      typeof (entry as { url?: unknown }).url === "string" &&
      Array.isArray((entry as { links?: unknown }).links)
    ) {
      const e = entry as { url: string; links: unknown[] };
      nodes.push({ url: e.url, links: e.links.filter((l): l is string => typeof l === "string") });
    }
  }
  return nodes;
}

export default async function InformePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      domain: true,
      isLocalBusiness: true,
      businessName: true,
      address: true,
      gscSiteUrl: true,
      reportConfig: true,
    },
  });
  if (!project) notFound();

  const now = new Date();
  const rawYear = Number(sp.year);
  const rawMonth = Number(sp.month);
  const year =
    Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 3000 ? rawYear : now.getFullYear();
  const month =
    Number.isInteger(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : now.getMonth() + 1;
  const startOfMonth = new Date(year, month - 1, 1);
  const startOfNextMonth = new Date(year, month, 1);
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1;

  function monthHref(y: number, m: number): string {
    return `/admin/proyectos/${id}/informe?year=${y}&month=${m}`;
  }
  const prevMonth = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  const nextMonth = month === 12 ? { y: year + 1, m: 1 } : { y: year, m: month + 1 };
  const nextDisabled =
    nextMonth.y > now.getFullYear() ||
    (nextMonth.y === now.getFullYear() && nextMonth.m > now.getMonth() + 1);

  const [
    latestAudit,
    rankKeywords,
    studyCount,
    keywordTotal,
    monthCostAgg,
    latestGeogrid,
    completedTodos,
    linksRun,
    competitors,
    structureStudy,
    titulosMetaGens,
    schemaGens,
    contenidoGens,
    gscSnapshot,
  ] = await Promise.all([
    prisma.auditRun.findFirst({
      where: { projectId: id, status: "completed", completedAt: { lt: startOfNextMonth } },
      orderBy: { completedAt: "desc" },
      select: { overallScore: true, categoryScores: true, pagesCrawled: true, completedAt: true },
    }),
    prisma.rankKeyword.findMany({
      where: { projectId: id },
      select: { keyword: true, device: true, lastPosition: true, bestPosition: true, lastCheckedAt: true },
    }),
    prisma.keywordStudy.count({ where: { projectId: id } }),
    prisma.keyword.count({ where: { study: { projectId: id } } }),
    prisma.apiUsageLog.aggregate({
      where: { projectId: id, createdAt: { gte: startOfMonth, lt: startOfNextMonth } },
      _sum: { costUsd: true },
    }),
    prisma.geogridRun.findFirst({
      where: { projectId: id, status: "completed", completedAt: { lt: startOfNextMonth } },
      orderBy: { completedAt: "desc" },
      select: {
        keyword: true, gridSize: true, radiusKm: true, centerLat: true, centerLng: true,
        foundCount: true, averagePosition: true, points: true, completedAt: true,
      },
    }),
    prisma.todoItem.findMany({
      where: { projectId: id, done: true, completedAt: { gte: startOfMonth, lt: startOfNextMonth } },
      orderBy: { completedAt: "desc" },
      select: { id: true, text: true, issueType: true, affectedUrls: true, completedAt: true },
    }),
    prisma.auditRun.findFirst({
      where: { projectId: id, status: "completed", linkGraph: { not: Prisma.DbNull } },
      orderBy: { triggeredAt: "desc" },
      select: { linkGraph: true, completedAt: true, triggeredAt: true },
    }),
    prisma.competitor.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "asc" },
      select: { id: true, domain: true, contentGap: true, contentGapAt: true },
    }),
    // Arquitectura de URLs: último estudio con estructura generada.
    prisma.keywordStudy.findFirst({
      where: { projectId: id, structure: { not: Prisma.DbNull } },
      orderBy: { updatedAt: "desc" },
      select: { structure: true, updatedAt: true },
    }),
    prisma.titleMetaGeneration.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { url: true, variants: true, createdAt: true },
    }),
    prisma.schemaGeneration.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { url: true, selectedType: true, valid: true, createdAt: true },
    }),
    prisma.contentGeneration.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { topic: true, model: true, createdAt: true },
    }),
    prisma.gscSnapshot.findFirst({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      select: { totals: true, topQueries: true, month: true, rangeDays: true },
    }),
  ]);

  const monthCost = monthCostAgg._sum.costUsd ? Number(monthCostAgg._sum.costUsd) : 0;
  const cats = (latestAudit?.categoryScores ?? null) as CategoryScores | null;

  const topRank = [...rankKeywords]
    .sort((a, b) => {
      if (a.bestPosition == null && b.bestPosition == null) return 0;
      if (a.bestPosition == null) return 1;
      if (b.bestPosition == null) return -1;
      return a.bestPosition - b.bestPosition;
    })
    .slice(0, 10);

  const rankedCount = rankKeywords.filter((k) => k.lastPosition != null).length;
  const generationDate = now.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  const monthLabel = capitalizeFirst(
    startOfMonth.toLocaleDateString("es-ES", { month: "long", year: "numeric" })
  );

  // --- Enlaces internos: réplica del cálculo de /api/.../enlaces ---
  let linksData: ReportData["links"] = null;
  if (linksRun?.linkGraph) {
    const graph = parseLinkGraph(linksRun.linkGraph as unknown);
    if (graph.length > 0) {
      const nodeSet = new Set(graph.map((g) => g.url));
      const outAdjacency = new Map<string, Set<string>>();
      for (const entry of graph) {
        const targets = new Set<string>();
        for (const link of entry.links) {
          if (link !== entry.url && nodeSet.has(link)) targets.add(link);
        }
        outAdjacency.set(entry.url, targets);
      }
      const incomingCount = new Map<string, number>();
      for (const targets of outAdjacency.values()) {
        for (const target of targets) {
          incomingCount.set(target, (incomingCount.get(target) ?? 0) + 1);
        }
      }
      const ranks = computePageRank(graph);
      const pages = graph
        .map((entry) => ({
          url: entry.url,
          pagerank: ranks.get(entry.url) ?? 0,
          incoming: incomingCount.get(entry.url) ?? 0,
          outgoing: outAdjacency.get(entry.url)?.size ?? 0,
        }))
        .sort((a, b) => b.pagerank - a.pagerank);
      const orphans = pages.filter((p) => p.incoming === 0).map((p) => p.url).sort();
      const topHubs = [...pages].sort((a, b) => b.outgoing - a.outgoing).slice(0, 5).map((p) => p.url);
      linksData = { pages, orphans, topHubs, auditDate: linksRun.completedAt ?? linksRun.triggeredAt };
    }
  }

  // --- Competidores: tu propia visibilidad + último snapshot por competidor ---
  // Mismos datos que el módulo Competidores (VisibilitySnapshot/Competitor) —
  // ver es gratis, no dispara ninguna llamada nueva a DataForSEO.
  const ownDomain = project.domain ? normalizeDomain(project.domain) : null;
  const ownSnapshot = ownDomain
    ? await prisma.visibilitySnapshot.findFirst({
        where: { projectId: id, domain: ownDomain },
        orderBy: { fetchedAt: "desc" },
        select: { organicTraffic: true, organicKeywords: true, topKeywords: true, fetchedAt: true },
      })
    : null;
  const ownVisibility: ReportData["competitors"]["own"] = ownSnapshot
    ? {
        organicTraffic: ownSnapshot.organicTraffic,
        organicKeywords: ownSnapshot.organicKeywords,
        topKeywords: ownSnapshot.topKeywords as TopKeyword[] | null,
        fetchedAt: ownSnapshot.fetchedAt,
      }
    : null;

  const competitorSnapshots = await Promise.all(
    competitors.map(async (c) => {
      const snap = await prisma.visibilitySnapshot.findFirst({
        where: { projectId: id, domain: c.domain },
        orderBy: { fetchedAt: "desc" },
        select: { organicTraffic: true, organicKeywords: true, topKeywords: true, fetchedAt: true },
      });
      return {
        domain: c.domain,
        organicTraffic: snap?.organicTraffic ?? null,
        organicKeywords: snap?.organicKeywords ?? null,
        topKeywords: (snap?.topKeywords ?? null) as ReportData["competitors"]["items"][number]["topKeywords"],
        contentGap: (c.contentGap ?? null) as ReportData["competitors"]["items"][number]["contentGap"],
        contentGapAt: c.contentGapAt,
        fetchedAt: snap?.fetchedAt ?? null,
      };
    })
  );

  // --- Arquitectura de URLs ---
  type StructurePage = { slug: string; h1: string };
  let arquitectura: ReportData["arquitectura"] = null;
  if (structureStudy?.structure) {
    const s = structureStudy.structure as { pages?: unknown };
    if (Array.isArray(s.pages)) {
      const pages = (s.pages as Array<Record<string, unknown>>)
        .filter((p) => typeof p.slug === "string" || typeof p.h1 === "string")
        .slice(0, 10) as StructurePage[];
      arquitectura = { pages, updatedAt: structureStudy.updatedAt };
    }
  }

  // --- Canibalizaciones (best-effort en vivo desde GSC) ---
  let canibalizaciones: ReportData["canibalizaciones"] = null;
  if (project.gscSiteUrl) {
    try {
      const auth = await getGoogleClient();
      const range = {
        startDate: new Date(now.getTime() - 90 * 24 * 3600 * 1000).toISOString().slice(0, 10),
        endDate: new Date(now.getTime() - 2 * 24 * 3600 * 1000).toISOString().slice(0, 10),
      };
      const items = await listCannibalizations(auth, project.gscSiteUrl, range);
      canibalizaciones = {
        count: items.length,
        top: items.slice(0, 5).map((it) => ({
          query: it.query,
          urls: it.pages.length,
          clicks: it.pages.reduce((s, p) => s + p.clicks, 0),
        })),
      };
    } catch (error) {
      // "Google no conectado" es un caso esperado (proyecto sin OAuth vigente) y
      // se ignora en silencio. Cualquier otro error es transitorio (rate limit,
      // GSC caído...) y no debe romper el informe, pero sí queda registrado para
      // poder depurarlo.
      if (!(error instanceof GoogleNotConnectedError)) {
        console.error("[informe] error al calcular canibalizaciones:", error);
      }
      canibalizaciones = null;
    }
  }

  // --- Google / Search Console (snapshot) ---
  let google: ReportData["google"] = null;
  if (gscSnapshot) {
    const totals = gscSnapshot.totals as { clicks: number; impressions: number; ctr: number; position: number } | null;
    const qs = (gscSnapshot.topQueries ?? null) as Array<{ query: string; clicks: number; position: number }> | null;
    google = {
      month: gscSnapshot.month,
      rangeDays: gscSnapshot.rangeDays,
      totals: totals ?? { clicks: 0, impressions: 0, ctr: 0, position: 0 },
      topQueries: (qs ?? []).slice(0, 5),
    };
  }

  const { sections: initialConfig, order: initialOrder } = normalizeReportConfig(project.reportConfig);

  const data: ReportData = {
    project: { name: project.name, domain: project.domain, isLocalBusiness: project.isLocalBusiness },
    monthLabel,
    generationDate,
    isCurrentMonth,
    prevHref: monthHref(prevMonth.y, prevMonth.m),
    nextHref: nextDisabled ? null : monthHref(nextMonth.y, nextMonth.m),
    tasks: completedTodos.map((t) => ({
      id: t.id, text: t.text, issueType: t.issueType, affectedUrls: t.affectedUrls, completedAt: t.completedAt,
    })),
    audit: latestAudit
      ? {
          overallScore: latestAudit.overallScore,
          categoryScores: cats,
          pagesCrawled: latestAudit.pagesCrawled,
          completedAt: latestAudit.completedAt,
        }
      : null,
    authority: gscSnapshot
      ? (() => {
          const totals = gscSnapshot.totals as { impressions?: number; clicks?: number; position?: number } | null;
          return {
            impressions: totals?.impressions ?? 0,
            clicks: totals?.clicks ?? 0,
            queries: Array.isArray(gscSnapshot.topQueries) ? gscSnapshot.topQueries.length : 0,
            position: totals?.position ?? 0,
            month: gscSnapshot.month,
          };
        })()
      : null,
    rank: {
      keywords: rankKeywords.map((k) => ({
        keyword: k.keyword, device: k.device, lastPosition: k.lastPosition,
        bestPosition: k.bestPosition, lastCheckedAt: k.lastCheckedAt,
      })),
      topRank: topRank.map((k) => ({
        keyword: k.keyword, device: k.device, lastPosition: k.lastPosition,
        bestPosition: k.bestPosition, lastCheckedAt: k.lastCheckedAt,
      })),
      rankedCount,
    },
    keywords: { studyCount, keywordTotal },
    arquitectura,
    "titulos-meta": titulosMetaGens.map((g) => ({
      url: g.url, variants: g.variants as unknown as { title: string; description: string }[], createdAt: g.createdAt,
    })),
    schema: schemaGens.map((g) => ({
      url: g.url, selectedType: g.selectedType, valid: g.valid, createdAt: g.createdAt,
    })),
    contenido: contenidoGens.map((g) => ({ topic: g.topic, model: g.model, createdAt: g.createdAt })),
    google,
    canibalizaciones,
    geogrid: latestGeogrid
      ? {
          keyword: latestGeogrid.keyword, gridSize: latestGeogrid.gridSize, radiusKm: latestGeogrid.radiusKm,
          centerLat: latestGeogrid.centerLat, centerLng: latestGeogrid.centerLng,
          foundCount: latestGeogrid.foundCount, averagePosition: latestGeogrid.averagePosition,
          points: latestGeogrid.points as { row: number; col: number; lat: number; lng: number; position: number | null }[] | null,
          completedAt: latestGeogrid.completedAt,
        }
      : null,
    costs: { monthCost },
    links: linksData,
    competitors: { own: ownVisibility, items: competitorSnapshots },
  };

  return <InformeBuilder projectId={id} data={data} initialConfig={initialConfig} initialOrder={initialOrder} />;
}
