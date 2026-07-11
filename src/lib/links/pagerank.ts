// PageRank iterativo sobre el grafo de enlaces internos de una auditoría
// (Módulo de enlazado interno). Pura, sin IO ni dependencias: recibe el
// grafo tal cual lo persiste el crawler (Módulo 8) y devuelve la puntuación
// normalizada por URL.
//
// La fórmula clásica por iteración es:
//
//   PR(i) = (1 - d) / N + d · ( danglingMass / N + Σ_{j → i} PR(j) / outdeg(j) )
//
//   - d      = factor de amortiguación (damping), por defecto 0.85
//   - N      = nº de nodos del grafo
//   - outdeg(j) = nº de enlaces salientes de j que apuntan a nodos del propio
//     grafo (los enlaces a URLs fuera del conjunto se ignoran — no aportan)
//   - danglingMass = suma de PR de los nodos sin salidas internas, repartida
//     a partes iguales entre todos para conservar la masa total (suma = 1)
//
// Se itera hasta `iterations` (30) o hasta que el mayor cambio absoluto entre
// dos iteraciones sea menor que `tolerance` (1e-6). El resultado se renormaliza
// a suma 1 como red de seguridad frente al desplazamiento en coma flotante.

export type LinkNode = { url: string; links: string[] };

export type PageRankOptions = {
  damping?: number;
  iterations?: number;
  tolerance?: number;
};

export function computePageRank(
  graph: LinkNode[],
  opts: PageRankOptions = {}
): Map<string, number> {
  const damping = opts.damping ?? 0.85;
  const maxIterations = opts.iterations ?? 30;
  const tolerance = opts.tolerance ?? 1e-6;

  const nodes = graph.map((g) => g.url);
  const n = nodes.length;
  const ranks = new Map<string, number>();
  if (n === 0) return ranks;

  const nodeSet = new Set(nodes);

  // Adyacencia saliente interna: para cada nodo, los enlaces únicos a otros
  // nodos del grafo (se descartan autoenlaces y URLs externas al conjunto).
  const outAdjacency = new Map<string, string[]>();
  for (const entry of graph) {
    const seen = new Set<string>();
    for (const link of entry.links) {
      if (link !== entry.url && nodeSet.has(link) && !seen.has(link)) seen.add(link);
    }
    outAdjacency.set(entry.url, [...seen]);
  }

  for (const url of nodes) ranks.set(url, 1 / n);

  for (let iter = 0; iter < maxIterations; iter++) {
    const next = new Map<string, number>();

    let danglingMass = 0;
    for (const url of nodes) {
      if ((outAdjacency.get(url)?.length ?? 0) === 0) danglingMass += ranks.get(url) ?? 0;
    }

    const base = (1 - damping) / n + (damping * danglingMass) / n;
    for (const url of nodes) next.set(url, base);

    for (const url of nodes) {
      const targets = outAdjacency.get(url) ?? [];
      const outdeg = targets.length;
      if (outdeg === 0) continue;
      const share = (damping * (ranks.get(url) ?? 0)) / outdeg;
      for (const target of targets) {
        next.set(target, (next.get(target) ?? 0) + share);
      }
    }

    let delta = 0;
    for (const url of nodes) {
      delta = Math.max(delta, Math.abs((next.get(url) ?? 0) - (ranks.get(url) ?? 0)));
    }

    for (const url of nodes) ranks.set(url, next.get(url) ?? 0);

    if (delta < tolerance) break;
  }

  let sum = 0;
  for (const url of nodes) sum += ranks.get(url) ?? 0;
  if (sum > 0) {
    for (const url of nodes) ranks.set(url, (ranks.get(url) ?? 0) / sum);
  }

  return ranks;
}
