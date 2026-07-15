import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { computePageRank, type LinkNode } from "@/lib/links/pagerank";

// Valida que el `linkGraph` (Json?) tenga la forma esperada por el crawler:
// array de { url: string, links: string[] }. Cualquier entrada malformada se
// descarta para no romper el cálculo aunque el grafo esté incompleto.
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { id } = await params;
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) return NextResponse.json({ error: "Proyecto no encontrado" }, { status: 404 });

  // Auditoría completada más reciente que haya persistido un grafo de enlaces.
  // Para un campo Json?, "no nulo" se expresa con Prisma.DbNull (SQL NULL).
  const run = await prisma.auditRun.findFirst({
    where: {
      projectId: id,
      status: "completed",
      linkGraph: { not: Prisma.DbNull },
    },
    orderBy: { triggeredAt: "desc" },
  });

  if (!run || !run.linkGraph) {
    return NextResponse.json({ needsAudit: true });
  }

  const graph = parseLinkGraph(run.linkGraph as unknown);
  if (graph.length === 0) {
    return NextResponse.json({ needsAudit: true });
  }

  const nodeSet = new Set(graph.map((g) => g.url));

  // Adyacencia saliente interna (mismo criterio que el cálculo de PageRank:
  // enlaces únicos a nodos del grafo, sin autoenlaces ni URLs externas).
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

  // Enlaces externos: el crawler ya los cuenta por página en AuditPage
  // (externalLinksCount + externalDomains, hasta 10 dominios). Se unen por URL
  // al grafo interno para mostrar "cuántos y cuáles" salen fuera del sitio.
  const auditPages = await prisma.auditPage.findMany({
    where: { auditRunId: run.id },
    select: { url: true, externalLinksCount: true, externalDomains: true },
  });
  const extByPage = new Map<string, { count: number; domains: string[] }>();
  const domainPageCount = new Map<string, number>(); // dominio -> nº de páginas que lo enlazan
  for (const ap of auditPages) {
    const domains = Array.isArray(ap.externalDomains)
      ? ap.externalDomains.filter((d): d is string => typeof d === "string")
      : [];
    extByPage.set(ap.url, { count: ap.externalLinksCount, domains });
    for (const d of domains) domainPageCount.set(d, (domainPageCount.get(d) ?? 0) + 1);
  }
  const topExternalDomains = Array.from(domainPageCount.entries())
    .map(([domain, pages]) => ({ domain, pages }))
    .sort((a, b) => b.pages - a.pages)
    .slice(0, 25);

  const pages = graph
    .map((entry) => {
      const ext = extByPage.get(entry.url) ?? { count: 0, domains: [] as string[] };
      return {
        url: entry.url,
        pagerank: ranks.get(entry.url) ?? 0,
        incoming: incomingCount.get(entry.url) ?? 0,
        outgoing: outAdjacency.get(entry.url)?.size ?? 0,
        externalLinks: ext.count,
        externalDomains: ext.domains,
      };
    })
    .sort((a, b) => b.pagerank - a.pagerank);

  const orphans = pages
    .filter((p) => p.incoming === 0)
    .map((p) => p.url)
    .sort();

  const topHubs = [...pages]
    .sort((a, b) => b.outgoing - a.outgoing)
    .slice(0, 5)
    .map((p) => p.url);

  const totalExternalLinks = pages.reduce((sum, p) => sum + p.externalLinks, 0);

  return NextResponse.json({
    pages,
    orphans,
    topHubs,
    topExternalDomains,
    totalExternalLinks,
    auditDate: run.completedAt ?? run.triggeredAt,
  });
}
