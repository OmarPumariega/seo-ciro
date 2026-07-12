import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import InformeBuilder, {
  type ReportData,
  type ReportSections,
  type CategoryScores,
} from "./InformeBuilder";
import { Prisma } from "@prisma/client";
import { computePageRank, type LinkNode } from "@/lib/links/pagerank";

function capitalizeFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const DEFAULT_SECTIONS: ReportSections = {
  audit: true,
  rank: true,
  keywords: true,
  geogrid: true,
  costs: true,
  tasks: true,
  links: true,
  competitors: true,
};

// Valida que el `linkGraph` (Json?) tenga la forma esperada por el crawler:
// array de { url: string, links: string[] }. Mismo parser que la ruta de
// enlaces — cualquier entrada malformada se descarta.
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
      nodes.push({
        url: e.url,
        links: e.links.filter((l): l is string => typeof l === "string"),
      });
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
      reportConfig: true,
    },
  });
  if (!project) notFound();

  const now = new Date();
  const rawYear = Number(sp.year);
  const rawMonth = Number(sp.month); // 1-12
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

  const [latestAudit, rankKeywords, studyCount, keywordTotal, monthCostAgg, latestGeogrid, completedTodos, linksRun, competitors] =
    await Promise.all([
      // Estado "a fecha de fin de ese mes": la auditoría más reciente completada
      // hasta ese momento, no siempre la más reciente de hoy — así un informe de
      // un mes pasado no filtra datos de después de ese mes.
      prisma.auditRun.findFirst({
        where: { projectId: id, status: "completed", completedAt: { lt: startOfNextMonth } },
        orderBy: { completedAt: "desc" },
        select: {
          overallScore: true,
          categoryScores: true,
          pagesCrawled: true,
          completedAt: true,
        },
      }),
      prisma.rankKeyword.findMany({
        where: { projectId: id },
        select: {
          keyword: true,
          device: true,
          lastPosition: true,
          bestPosition: true,
          lastCheckedAt: true,
        },
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
          keyword: true,
          gridSize: true,
          radiusKm: true,
          centerLat: true,
          centerLng: true,
          foundCount: true,
          averagePosition: true,
          points: true,
          completedAt: true,
        },
      }),
      // Trabajos Realizados: tareas (manuales o auto-generadas desde
      // auditoría) completadas de verdad dentro de ese mes natural.
      prisma.todoItem.findMany({
        where: { projectId: id, done: true, completedAt: { gte: startOfMonth, lt: startOfNextMonth } },
        orderBy: { completedAt: "desc" },
        select: { id: true, text: true, issueType: true, affectedUrls: true, completedAt: true },
      }),
      // Grafo de enlaces de la auditoría completada más reciente (sin tope de
      // mes: el enlazado interno es estructural, no mensual — igual que la
      // vista de Enlaces).
      prisma.auditRun.findFirst({
        where: {
          projectId: id,
          status: "completed",
          linkGraph: { not: Prisma.DbNull },
        },
        orderBy: { triggeredAt: "desc" },
        select: { linkGraph: true, completedAt: true, triggeredAt: true },
      }),
      prisma.competitor.findMany({
        where: { projectId: id },
        orderBy: { createdAt: "asc" },
        select: { id: true, domain: true },
      }),
    ]);

  const monthCost = monthCostAgg._sum.costUsd ? Number(monthCostAgg._sum.costUsd) : 0;
  const cats = (latestAudit?.categoryScores ?? null) as CategoryScores | null;

  // Top 10 keywords por mejor posición (ascendente; nulls al final).
  const topRank = [...rankKeywords]
    .sort((a, b) => {
      if (a.bestPosition == null && b.bestPosition == null) return 0;
      if (a.bestPosition == null) return 1;
      if (b.bestPosition == null) return -1;
      return a.bestPosition - b.bestPosition;
    })
    .slice(0, 10);

  const rankedCount = rankKeywords.filter((k) => k.lastPosition != null).length;
  const generationDate = now.toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  // toLocaleDateString da "julio de 2026"; se capitaliza solo la primera
  // letra (la clase Tailwind "capitalize" pone mayúscula en CADA palabra,
  // "Julio De 2026").
  const monthLabel = capitalizeFirst(
    startOfMonth.toLocaleDateString("es-ES", { month: "long", year: "numeric" })
  );

  // --- Enlaces internos: replica el cálculo de la ruta /api/.../enlaces ---
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
      const orphans = pages
        .filter((p) => p.incoming === 0)
        .map((p) => p.url)
        .sort();
      const topHubs = [...pages]
        .sort((a, b) => b.outgoing - a.outgoing)
        .slice(0, 5)
        .map((p) => p.url);
      linksData = {
        pages,
        orphans,
        topHubs,
        auditDate: linksRun.completedAt ?? linksRun.triggeredAt,
      };
    }
  }

  // --- Competidores: último snapshot de visibilidad por dominio ---
  const competitorSnapshots = await Promise.all(
    competitors.map(async (c) => {
      const snap = await prisma.visibilitySnapshot.findFirst({
        where: { projectId: id, domain: c.domain },
        orderBy: { fetchedAt: "desc" },
        select: {
          organicTraffic: true,
          organicKeywords: true,
          topKeywords: true,
          fetchedAt: true,
        },
      });
      return {
        domain: c.domain,
        organicTraffic: snap?.organicTraffic ?? null,
        organicKeywords: snap?.organicKeywords ?? null,
        topKeywords: (snap?.topKeywords ?? null) as ReportData["competitors"][number]["topKeywords"],
        fetchedAt: snap?.fetchedAt ?? null,
      };
    })
  );

  // --- Configuración de secciones guardada ---
  let initialConfig = DEFAULT_SECTIONS;
  if (project.reportConfig && typeof project.reportConfig === "object") {
    const stored = (project.reportConfig as { sections?: Record<string, unknown> }).sections;
    if (stored && typeof stored === "object") {
      initialConfig = {
        audit: typeof stored.audit === "boolean" ? stored.audit : true,
        rank: typeof stored.rank === "boolean" ? stored.rank : true,
        keywords: typeof stored.keywords === "boolean" ? stored.keywords : true,
        geogrid: typeof stored.geogrid === "boolean" ? stored.geogrid : true,
        costs: typeof stored.costs === "boolean" ? stored.costs : true,
        tasks: typeof stored.tasks === "boolean" ? stored.tasks : true,
        links: typeof stored.links === "boolean" ? stored.links : true,
        competitors: typeof stored.competitors === "boolean" ? stored.competitors : true,
      };
    }
  }

  const data: ReportData = {
    project: {
      name: project.name,
      domain: project.domain,
      isLocalBusiness: project.isLocalBusiness,
    },
    monthLabel,
    generationDate,
    isCurrentMonth,
    prevHref: monthHref(prevMonth.y, prevMonth.m),
    nextHref: nextDisabled ? null : monthHref(nextMonth.y, nextMonth.m),
    tasks: completedTodos.map((t) => ({
      id: t.id,
      text: t.text,
      issueType: t.issueType,
      affectedUrls: t.affectedUrls,
      completedAt: t.completedAt,
    })),
    audit: latestAudit
      ? {
          overallScore: latestAudit.overallScore,
          categoryScores: cats,
          pagesCrawled: latestAudit.pagesCrawled,
          completedAt: latestAudit.completedAt,
        }
      : null,
    rank: {
      keywords: rankKeywords.map((k) => ({
        keyword: k.keyword,
        device: k.device,
        lastPosition: k.lastPosition,
        bestPosition: k.bestPosition,
        lastCheckedAt: k.lastCheckedAt,
      })),
      topRank: topRank.map((k) => ({
        keyword: k.keyword,
        device: k.device,
        lastPosition: k.lastPosition,
        bestPosition: k.bestPosition,
        lastCheckedAt: k.lastCheckedAt,
      })),
      rankedCount,
    },
    keywords: { studyCount, keywordTotal },
    geogrid: latestGeogrid
      ? {
          keyword: latestGeogrid.keyword,
          gridSize: latestGeogrid.gridSize,
          radiusKm: latestGeogrid.radiusKm,
          centerLat: latestGeogrid.centerLat,
          centerLng: latestGeogrid.centerLng,
          foundCount: latestGeogrid.foundCount,
          averagePosition: latestGeogrid.averagePosition,
          points: latestGeogrid.points as { row: number; col: number; lat: number; lng: number; position: number | null }[] | null,
          completedAt: latestGeogrid.completedAt,
        }
      : null,
    costs: { monthCost },
    links: linksData,
    competitors: competitorSnapshots,
  };

  return <InformeBuilder projectId={id} data={data} initialConfig={initialConfig} />;
}
