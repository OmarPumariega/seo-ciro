import type OpenAI from "openai";
import { getOpenRouterClient, getDefaultOpenRouterModel } from "@/lib/seo/llm";
import { stripCodeFences } from "@/lib/seo/json";
import { buildKeywordHierarchy, type HierarchyNode } from "./keyword-hierarchy";

// Generación del árbol de URLs / jerarquía de encabezados a partir de las
// keywords ya resueltas de un estudio (Módulo 1).
//
// La AGRUPACIÓN (quién cuelga de quién, y el slug de cada página) es
// determinista — se calcula en buildKeywordHierarchy() por longitud de
// keyword + volumen real, SIN LLM. El LLM ya no decide la jerarquía (fuente
// de aleatoriedad e inconsistencia); su trabajo se reduce a: (a) decidir qué
// nodos hoja de bajo volumen se pliegan como sección del padre en vez de
// tener página propia (ver MAX_LEAF_SIBLINGS_PER_PARENT, también
// determinista), y (b) escribir h1/headings/navLabel para las páginas ya
// decididas. El slug es autoritativo y viene siempre de la jerarquía, nunca
// del LLM — si la respuesta del modelo falla para una página, se usa un
// fallback determinista en vez de descartarla (descartar rompería la
// jerarquía, dejando huérfano a un hijo cuyo padre desapareció).

export type StructurePage = {
  slug: string;
  h1: string;
  headings: string[];
  navLabel: string;
  keywords: string[];
};

export type StructureProposal = {
  pages: StructurePage[];
};

export type StructureKeyword = {
  keyword: string;
  searchVolume: number | null;
  intent: string | null;
  priority: number;
};

// Tope de hijos-hoja con página propia bajo un mismo padre — el resto (los
// de menor volumen) se pliegan como keywords secundarias de la página del
// padre en vez de generar una URL con apenas demanda detrás. Nodos raíz
// (sin padre) siempre son página, tengan o no volumen — no hay dónde
// plegarlos.
const MAX_LEAF_SIBLINGS_PER_PARENT = 8;

type PlannedPage = {
  slug: string;
  representativeKeyword: string; // la de mayor volumen entre las que cubre, para el prompt
  keywords: string[]; // propias + de las hojas plegadas aquí
  totalVolume: number;
  dominantIntent: string | null;
};

// Recorre la jerarquía decidiendo página propia vs plegado, y agrega las
// keywords/volumen/intención de cada página resultante. Determinista: mismo
// input → mismo resultado siempre.
function planPages(
  hierarchy: HierarchyNode[],
  intentByKeyword: Map<string, string | null>
): PlannedPage[] {
  const pages = new Map<string, PlannedPage>();

  function ensurePage(slug: string): PlannedPage {
    let p = pages.get(slug);
    if (!p) {
      p = { slug, representativeKeyword: "", keywords: [], totalVolume: 0, dominantIntent: null };
      pages.set(slug, p);
    }
    return p;
  }

  function addTo(page: PlannedPage, node: HierarchyNode) {
    page.keywords.push(node.keyword);
    page.totalVolume += node.searchVolume ?? 0;
  }

  function visit(node: HierarchyNode) {
    const isHub = node.children.length > 0;
    const page = ensurePage(node.slug);
    addTo(page, node);

    if (!isHub) return;

    const leafChildren = node.children.filter((c) => c.children.length === 0);
    const hubChildren = node.children.filter((c) => c.children.length > 0);
    const promoted = new Set(
      [...leafChildren]
        .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
        .slice(0, MAX_LEAF_SIBLINGS_PER_PARENT)
        .filter((c) => c.searchVolume != null)
        .map((c) => c.slug)
    );

    for (const leaf of leafChildren) {
      if (promoted.has(leaf.slug)) {
        visit(leaf); // página propia
      } else {
        addTo(page, leaf); // se pliega en el padre
      }
    }
    for (const hub of hubChildren) visit(hub);
  }

  for (const root of hierarchy) visit(root);

  // Representativa = keyword de mayor volumen propio entre las cubiertas
  // (recalculado al final, más simple que llevar el máximo incremental).
  const byKeyword = new Map<string, number>();
  function indexVolumes(nodes: HierarchyNode[]) {
    for (const n of nodes) {
      byKeyword.set(n.keyword, n.searchVolume ?? 0);
      indexVolumes(n.children);
    }
  }
  indexVolumes(hierarchy);

  for (const page of pages.values()) {
    let best = page.keywords[0] ?? "";
    let bestVol = byKeyword.get(best) ?? 0;
    for (const kw of page.keywords) {
      const v = byKeyword.get(kw) ?? 0;
      if (v > bestVol) {
        best = kw;
        bestVol = v;
      }
    }
    page.representativeKeyword = best;

    const counts = new Map<string, number>();
    for (const kw of page.keywords) {
      const intent = intentByKeyword.get(kw.trim().toLowerCase());
      if (intent) counts.set(intent, (counts.get(intent) ?? 0) + 1);
    }
    let topIntent: string | null = null;
    let topCount = 0;
    for (const [intent, count] of counts) {
      if (count > topCount) {
        topIntent = intent;
        topCount = count;
      }
    }
    page.dominantIntent = topIntent;
  }

  return [...pages.values()];
}

const SYSTEM_PROMPT = `Eres un redactor SEO senior. Se te da una lista de páginas de un sitio web YA DECIDIDAS (su ruta/slug y qué palabras clave reales cubre cada una vienen fijadas de antemano — no las cambies ni inventes otras). Tu única tarea es, para CADA página de la lista, escribir su contenido: título H1, encabezados (H2/H3) y etiqueta de menú.

Devuelves ÚNICAMENTE un objeto JSON (sin markdown, sin explicaciones) con esta forma exacta:

{"pages": [{"slug": "la-misma-ruta-recibida", "h1": "Título H1", "headings": ["Subtítulo H2", "Otro H2"], "navLabel": "Etiqueta de menú"}]}

Reglas estrictas:
- Devuelve EXACTAMENTE una entrada por cada página recibida, en el mismo orden, con el mismo "slug" (cópialo literal, no lo edites).
- "h1": título principal orientado a la keyword representativa de esa página, en lenguaje natural (máx ~70 caracteres).
- "headings": de 1 a 5 subtítulos (H2/H3) reales, derivados de las keywords que cubre esa página. Nunca genéricos ("Introducción", "Conclusión") salvo que aporten.
- "navLabel": etiqueta MUY corta (1-3 palabras, idealmente 1-2) para el menú de navegación.
- Vincula la intención de búsqueda dominante de cada página con el tono: transaccional → orientado a servicio/producto; informacional → orientado a guía/blog; mixta → comparativa.
- Basa TODO en las keywords reales que se te dan por página. No inventes temas ajenos a ellas.
- No incluyas ningún campo ni texto fuera del JSON.`;

export function buildStructureSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

export function buildStructureUserMessage(studyName: string, pages: PlannedPage[]): string {
  const lines = pages
    .map((p) => {
      const kws = p.keywords.join(", ");
      return `- slug: "${p.slug}" | keyword representativa: ${p.representativeKeyword} | volumen total: ${p.totalVolume} | intención dominante: ${p.dominantIntent ?? "n/d"} | keywords que cubre: ${kws}`;
    })
    .join("\n");

  return `Estudio: "${studyName}"\n\nPáginas ya decididas (jerarquía real por volumen y longitud de keyword):\n${lines}\n\nEscribe el contenido (h1/headings/navLabel) de cada una.`;
}

function sanitizeSlug(slug: string): string {
  return slug
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9/\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^\/+|\/+$/g, "");
}

// Fallback determinista si el LLM no devuelve contenido válido para una
// página concreta — nunca se descarta una página (dejaría huérfanos a sus
// hijos en el árbol), se rellena con algo razonable derivado del dato real.
function fallbackContent(page: PlannedPage): { h1: string; headings: string[]; navLabel: string } {
  const label = page.representativeKeyword || page.slug.split("/").pop() || page.slug;
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
  return {
    h1: capitalized,
    headings: [`Todo sobre ${label}`],
    navLabel: capitalized.length > 24 ? capitalized.slice(0, 24) : capitalized,
  };
}

type LlmPageContent = { slug?: unknown; h1?: unknown; headings?: unknown; navLabel?: unknown };

export function parseStructureContent(raw: string): Map<string, { h1: string; headings: string[]; navLabel: string }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    throw new Error("Formato de respuesta de IA inválido (estructura mal formada)");
  }
  const obj = parsed as { pages?: unknown };
  if (!Array.isArray(obj.pages)) {
    throw new Error("Formato de respuesta de IA inválido (estructura mal formada)");
  }
  const result = new Map<string, { h1: string; headings: string[]; navLabel: string }>();
  for (const raw of obj.pages as LlmPageContent[]) {
    const slug = typeof raw.slug === "string" ? sanitizeSlug(raw.slug) : "";
    if (!slug) continue;
    const h1 = typeof raw.h1 === "string" ? raw.h1.trim() : "";
    const headings = Array.isArray(raw.headings)
      ? (raw.headings as unknown[]).filter((h): h is string => typeof h === "string" && h.trim() !== "").map((h) => h.trim())
      : [];
    const navLabel = typeof raw.navLabel === "string" && raw.navLabel.trim() ? raw.navLabel.trim() : h1;
    if (!h1 || headings.length === 0) continue;
    result.set(slug, { h1, headings, navLabel });
  }
  return result;
}

export type StructureGenerationResult = {
  structure: StructureProposal;
  model: string;
  usage: OpenAI.CompletionUsage | undefined;
};

export async function generateStructure(params: {
  studyName: string;
  keywords: StructureKeyword[];
}): Promise<StructureGenerationResult> {
  const hierarchy = buildKeywordHierarchy(
    params.keywords.map((k) => ({ keyword: k.keyword, searchVolume: k.searchVolume }))
  );
  if (hierarchy.length === 0) {
    throw new Error("El estudio no tiene keywords suficientes para generar una estructura");
  }

  const intentByKeyword = new Map(params.keywords.map((k) => [k.keyword.trim().toLowerCase(), k.intent]));
  const plannedPages = planPages(hierarchy, intentByKeyword);

  const client = await getOpenRouterClient();
  const model = await getDefaultOpenRouterModel();

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.3,
    messages: [
      { role: "system", content: buildStructureSystemPrompt() },
      { role: "user", content: buildStructureUserMessage(params.studyName, plannedPages) },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  const llmContent = raw ? parseStructureContent(raw) : new Map();

  const pages: StructurePage[] = plannedPages.map((p) => {
    const content = llmContent.get(p.slug) ?? fallbackContent(p);
    return {
      slug: p.slug,
      h1: content.h1,
      headings: content.headings,
      navLabel: content.navLabel,
      keywords: p.keywords,
    };
  });

  return { structure: { pages }, model, usage: completion.usage };
}
