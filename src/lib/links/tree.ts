import type { LinkNode } from "@/lib/links/pagerank";

// Árbol de jerarquía real del sitio: BFS desde la home sobre el mismo grafo
// de enlaces del crawler (Módulo 8), asignando a cada página como "padre" la
// primera que la descubre (menor profundidad de clics desde la home). A
// diferencia de trocear el path de la URL, esto refleja cómo se navega el
// sitio de verdad — útil incluso con URLs planas (ej. todo bajo /blog/slug).

export type TreeNode = { url: string; depth: number; children: TreeNode[] };

// El crawler (src/lib/audit/crawler.ts) normaliza cada URL del grafo con
// `new URL(x).toString()`, que añade "/" al pathname vacío de la home
// ("https://dominio.com" → "https://dominio.com/"). `AuditRun.startUrl` se
// guarda tal cual se lanzó el crawl (sin ese "/"), así que hay que aplicar la
// misma normalización antes de buscarlo en el grafo o nunca coincide.
function resolveRoot(nodeSet: Set<string>, rootUrl: string): string | null {
  if (nodeSet.has(rootUrl)) return rootUrl;
  try {
    const normalized = new URL(rootUrl).toString();
    if (nodeSet.has(normalized)) return normalized;
  } catch {
    // rootUrl no era una URL válida — se trata como no encontrada abajo.
  }
  return null;
}

export function buildLinkTree(
  graph: LinkNode[],
  rootUrl: string
): { root: TreeNode | null; unreached: string[] } {
  const allUrls = graph.map((g) => g.url).sort();
  const nodeSet = new Set(allUrls);
  const resolvedRoot = resolveRoot(nodeSet, rootUrl);
  if (resolvedRoot === null) {
    return { root: null, unreached: allUrls };
  }
  rootUrl = resolvedRoot;

  const outAdjacency = new Map<string, string[]>();
  for (const entry of graph) {
    const seen = new Set<string>();
    const targets: string[] = [];
    for (const link of entry.links) {
      if (link !== entry.url && nodeSet.has(link) && !seen.has(link)) {
        seen.add(link);
        targets.push(link);
      }
    }
    outAdjacency.set(entry.url, targets);
  }

  const visited = new Set<string>([rootUrl]);
  const nodeByUrl = new Map<string, TreeNode>();
  const root: TreeNode = { url: rootUrl, depth: 0, children: [] };
  nodeByUrl.set(rootUrl, root);

  const queue: string[] = [rootUrl];
  while (queue.length > 0) {
    const url = queue.shift() as string;
    const parentNode = nodeByUrl.get(url) as TreeNode;
    for (const target of outAdjacency.get(url) ?? []) {
      if (visited.has(target)) continue;
      visited.add(target);
      const childNode: TreeNode = { url: target, depth: parentNode.depth + 1, children: [] };
      parentNode.children.push(childNode);
      nodeByUrl.set(target, childNode);
      queue.push(target);
    }
  }

  const unreached = allUrls.filter((u) => !visited.has(u));
  return { root, unreached };
}
