import { normalizeKeyword } from "./normalize";

// Jerarquía determinista de keywords: sin LLM, sin tope de niveles. La regla
// es puramente longitud de keyword (nº de palabras) + volumen real:
//   - El padre de una keyword es la keyword MÁS CORTA "contenida" en ella
//     (mismo conjunto de palabras, sin stopwords) con más palabras posibles
//     — la cadena más cercana, no se saltan niveles.
//   - Entre varios candidatos válidos, gana el de mayor volumen real.
//   - Sin candidato → raíz de su propia rama.
// Aplica igual a variantes geográficas ("cerrajeros" → "cerrajeros gijón")
// que a cualquier otro atributo long-tail (color, uso, precio...), sin casos
// especiales — no es un patrón fijo de N niveles.

export type HierarchyNode = {
  keyword: string;
  searchVolume: number | null; // propio, null = sin dato (nunca 0 fabricado)
  subtreeVolume: number; // suma real de este nodo + todos sus descendientes
  slug: string; // ruta completa desde la raíz, ej. "camion/rojo/usado"
  children: HierarchyNode[];
};

// Lista corta de stopwords en español — solo para decidir contención (qué
// keyword "cuelga" de cuál), nunca para el texto mostrado. Evita que "camión
// de segunda mano" y "camión segunda mano" se traten como cabezas distintas
// por culpa de una preposición.
const STOPWORDS_ES = new Set([
  "de", "del", "la", "el", "los", "las", "en", "con", "para", "por", "y",
  "a", "un", "una", "unos", "unas", "al", "tu", "mi", "su", "o", "e", "que",
]);

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function tokenize(keyword: string): string[] {
  return stripAccents(normalizeKeyword(keyword))
    .split(" ")
    .filter((w) => w && !STOPWORDS_ES.has(w));
}

function slugifyWords(words: string[]): string {
  return words
    .map((w) =>
      stripAccents(w.toLowerCase())
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
    )
    .filter(Boolean)
    .join("-");
}

type InternalNode = {
  keyword: string;
  searchVolume: number | null;
  tokens: string[]; // orden original (sin stopwords), para el slug
  tokenSet: Set<string>; // para la comprobación de subconjunto
  parent: InternalNode | null;
  children: InternalNode[];
};

export function buildKeywordHierarchy(
  keywords: { keyword: string; searchVolume: number | null }[]
): HierarchyNode[] {
  const nodes: InternalNode[] = [];
  const seen = new Set<string>();
  for (const k of keywords) {
    const norm = normalizeKeyword(k.keyword);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    const tokens = tokenize(k.keyword);
    if (tokens.length === 0) continue; // keyword compuesta solo de stopwords, caso degenerado
    nodes.push({
      keyword: k.keyword.trim(),
      searchVolume: k.searchVolume,
      tokens,
      tokenSet: new Set(tokens),
      parent: null,
      children: [],
    });
  }

  // Padre = candidato con MÁS palabras (el más cercano/específico posible,
  // para formar una cadena real: camión → camión rojo → camión rojo usado,
  // no saltarse niveles) cuyo conjunto de palabras sea subconjunto propio.
  // Empate → mayor volumen; empate → orden alfabético (estable entre
  // regeneraciones, no depende del orden de entrada).
  for (const node of nodes) {
    let best: InternalNode | null = null;
    for (const candidate of nodes) {
      if (candidate === node) continue;
      if (candidate.tokens.length >= node.tokens.length) continue;
      let isSubset = true;
      for (const t of candidate.tokenSet) {
        if (!node.tokenSet.has(t)) {
          isSubset = false;
          break;
        }
      }
      if (!isSubset) continue;
      if (
        !best ||
        candidate.tokens.length > best.tokens.length ||
        (candidate.tokens.length === best.tokens.length &&
          (candidate.searchVolume ?? 0) > (best.searchVolume ?? 0)) ||
        (candidate.tokens.length === best.tokens.length &&
          (candidate.searchVolume ?? 0) === (best.searchVolume ?? 0) &&
          candidate.keyword.localeCompare(best.keyword) < 0)
      ) {
        best = candidate;
      }
    }
    node.parent = best;
  }

  const roots: InternalNode[] = [];
  for (const node of nodes) {
    if (node.parent) node.parent.children.push(node);
    else roots.push(node);
  }

  function sortByVolume(list: HierarchyNode[]): HierarchyNode[] {
    return [...list].sort(
      (a, b) => b.subtreeVolume - a.subtreeVolume || a.keyword.localeCompare(b.keyword)
    );
  }

  // El segmento propio del slug son solo las palabras que ANADE este nodo
  // respecto a su padre (delta, en el orden original) — no la keyword
  // completa repetida en cada nivel. "camión rojo usado" cuelga de "camión
  // rojo" → segmento "usado", slug final "camion/rojo/usado", no
  // "camion/camion-rojo/camion-rojo-usado".
  function toHierarchyNode(node: InternalNode, parentSlug: string): HierarchyNode {
    const parentTokens = node.parent ? node.parent.tokenSet : null;
    const delta = parentTokens ? node.tokens.filter((t) => !parentTokens.has(t)) : node.tokens;
    const ownSegment = slugifyWords(delta.length > 0 ? delta : node.tokens);
    const slug = parentSlug ? `${parentSlug}/${ownSegment}` : ownSegment;
    const children = sortByVolume(node.children.map((c) => toHierarchyNode(c, slug)));
    const subtreeVolume =
      (node.searchVolume ?? 0) + children.reduce((sum, c) => sum + c.subtreeVolume, 0);
    return { keyword: node.keyword, searchVolume: node.searchVolume, subtreeVolume, slug, children };
  }

  return sortByVolume(roots.map((r) => toHierarchyNode(r, "")));
}

// Recorre la jerarquía en pre-orden (padres antes que hijos), útil para
// aplanar a una lista o para decidir página-propia nivel a nivel.
export function walkHierarchy(
  nodes: HierarchyNode[],
  visit: (node: HierarchyNode, parent: HierarchyNode | null) => void,
  parent: HierarchyNode | null = null
): void {
  for (const node of nodes) {
    visit(node, parent);
    walkHierarchy(node.children, visit, node);
  }
}
