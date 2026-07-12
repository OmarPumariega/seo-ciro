import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { computePageRank, type LinkNode } from "@/lib/links/pagerank";
import { buildLinkTree } from "@/lib/links/tree";

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

  const { root: tree, unreached: unreachedFromRoot } = buildLinkTree(graph, run.startUrl);

  return NextResponse.json({
    pages,
    orphans,
    topHubs,
    tree,
    unreachedFromRoot,
    auditDate: run.completedAt ?? run.triggeredAt,
  });
}
