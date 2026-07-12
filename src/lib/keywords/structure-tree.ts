import { normalizeKeyword } from "@/lib/keywords/normalize";
import type { StructurePage } from "@/lib/keywords/structure";

// Construye el árbol de jerarquía del módulo Arquitectura a partir de la
// estructura de URLs ya generada (Módulo 1, `KeywordStudy.structure`, LLM
// vía OpenRouter): cada `page.slug` es una ruta relativa completa
// ("servicios/abogado-de-familia") — el árbol se arma agrupando por
// segmentos de esa ruta, sin que el LLM tenga que emitir JSON anidado (así
// lo documenta ya `src/lib/keywords/structure.ts`).
//
// El volumen de cada nodo es 100% real: la suma del `searchVolume` de las
// keywords que esa página reclama (`page.keywords`), cruzado contra las
// keywords reales del estudio — nunca estimado ni inventado. Las páginas
// "carpeta" intermedias (ej. "servicios/" si no es una página propia) se
// crean igualmente para poder agrupar, con volumen = suma de sus hijas.

export type StructureTreeNode = {
  segment: string;
  path: string;
  page: StructurePage | null;
  volume: number;
  children: StructureTreeNode[];
};

function ownVolume(page: StructurePage | null, volumeByKeyword: Map<string, number>): number {
  if (!page) return 0;
  return page.keywords.reduce((sum, kw) => sum + (volumeByKeyword.get(normalizeKeyword(kw)) ?? 0), 0);
}

function computeVolume(node: StructureTreeNode, volumeByKeyword: Map<string, number>): number {
  let total = ownVolume(node.page, volumeByKeyword);
  for (const child of node.children) total += computeVolume(child, volumeByKeyword);
  node.volume = total;
  return total;
}

function sortChildren(node: StructureTreeNode) {
  node.children.sort((a, b) => b.volume - a.volume);
  for (const child of node.children) sortChildren(child);
}

export function buildStructureTree(
  pages: StructurePage[],
  volumeByKeyword: Map<string, number>
): StructureTreeNode {
  const root: StructureTreeNode = { segment: "", path: "", page: null, volume: 0, children: [] };

  for (const page of pages) {
    const segments = page.slug.split("/").filter(Boolean);
    if (segments.length === 0) continue;
    let node = root;
    let pathSoFar = "";
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      pathSoFar = pathSoFar ? `${pathSoFar}/${seg}` : seg;
      let child = node.children.find((c) => c.segment === seg);
      if (!child) {
        child = { segment: seg, path: pathSoFar, page: null, volume: 0, children: [] };
        node.children.push(child);
      }
      node = child;
      if (i === segments.length - 1) node.page = page;
    }
  }

  computeVolume(root, volumeByKeyword);
  sortChildren(root);
  return root;
}
