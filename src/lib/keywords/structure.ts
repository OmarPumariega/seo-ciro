import type OpenAI from "openai";
import { getOpenRouterClient, DEFAULT_OPENROUTER_MODEL } from "@/lib/seo/llm";
import { stripCodeFences } from "@/lib/seo/json";

// Generación del árbol de URLs / jerarquía de encabezados a partir de las
// keywords ya resueltas de un estudio (Módulo 1). Sigue el mismo estilo de
// prompt que title-meta.ts/schema.ts: el LLM devuelve un JSON puro que se
// valida de forma estricta; si la forma no es la esperada se lanza y la ruta
// devuelve 502 sin escribir nada en KeywordStudy.structure.
//
// `slug` es una ruta relativa completa (ej. "servicios/abogado-de-familia"):
// el árbol se construye en el cliente agrupando por prefijos de ruta, sin que
// el LLM tenga que emitir JSON anidado. La intención de cada keyword ata al
// tipo de página (informacional → blog, transaccional → servicio/producto,
// mixta → comparativa/categoría).

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

const SYSTEM_PROMPT = `Eres un arquitecto SEO senior. A partir de una lista de palabras clave con su volumen, intención y prioridad reales, diseñas la estructura de URLs y la jerarquía de encabezados de un sitio web.

Devuelves ÚNICAMENTE un objeto JSON (sin markdown, sin explicaciones) con esta forma exacta:

{"pages": [{"slug": "ruta/relativa", "h1": "Título H1", "headings": ["Subtítulo H2", "Otro H2"], "navLabel": "Etiqueta de menú", "keywords": ["keyword 1", "keyword 2"]}]}

Reglas estrictas:
- Agrupa las keywords en páginas coherentes temáticamente. Una keyword puede aparecer en una sola página.
- "slug" es una ruta relativa sin dominio ni barra inicial. Usa subcarpetas para agrupar (ej. "servicios/...", "blog/..."). Refleja una jerarquía real.
- "h1": el título principal de la página, orientado a la keyword principal de esa página. No inventes páginas que no se relacionen con ninguna keyword de la lista.
- "headings": de 1 a 5 subtítulos (H2/H3) reales para esa página, derivados de las keywords secundarias que agrupe. Nunca genéricos ("Introducción", "Conclusión") salvo que aporten.
- "navLabel": etiqueta corta (1-3 palabras) para el menú de navegación.
- "keywords": lista (puede ser vacía) de las keywords de la entrada que cette página cubre, copiadas literalmente.
- Vincula la intención de búsqueda con el tipo de página: las keywords transaccionales van a páginas de servicio/producto; las informacionales a blog/guía; las mixtas a comparativa/categoría.
- Basa TODO en los datos reales (volumen/intención/prioridad) de la lista. No inventes topics ajenos a la lista.
- No incluyas ningún campo ni texto fuera del JSON.`;

export function buildStructureSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

export function buildStructureUserMessage(studyName: string, keywords: StructureKeyword[]): string {
  const lines = keywords
    .map(
      (k) =>
        `- ${k.keyword} | volumen: ${k.searchVolume ?? "n/d"} | intención: ${k.intent ?? "n/d"} | prioridad: ${k.priority}`
    )
    .join("\n");

  return `Estudio: "${studyName}"\n\nLista de palabras clave (datos reales):\n${lines}\n\nGenera la estructura de URLs y encabezados.`;
}

function sanitizeSlug(slug: string): string {
  // Defensivo: el slug debe ser una ruta relativa sane (minúsculas, sin
  // caracteres raros, manteniendo "/" para subcarpetas). Se sanea en vez de
  // rechazar outright, mismo estilo "truncate-don't-reject" de title-meta.
  return slug
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9/\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^\/+|\/+$/g, "");
}

export function parseStructure(raw: string): StructureProposal {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    throw new Error("Formato de respuesta de IA inválido (estructura mal formada)");
  }

  const obj = parsed as { pages?: unknown };
  // Un array pages vacío o ausente es un fallo irrecuperable: lanzamos y la
  // ruta devuelve 502 sin persistir nada a medias.
  if (!Array.isArray(obj.pages) || obj.pages.length === 0) {
    throw new Error("Formato de respuesta de IA inválido (estructura mal formada)");
  }

  const pages: StructurePage[] = [];
  for (const p of obj.pages as Array<Record<string, unknown>>) {
    const h1 = typeof p.h1 === "string" ? p.h1.trim() : "";
    const headings = Array.isArray(p.headings)
      ? (p.headings as unknown[])
          .filter((h): h is string => typeof h === "string" && h.trim() !== "")
          .map((h) => h.trim())
      : [];

    // Página mal formada (sin h1 o sin headings) → se descarta, no aborta
    // toda la propuesta. Pero si TODAS caen aquí, pages acaba vacío y se
    // lanza abajo.
    if (!h1 || headings.length === 0) continue;

    const slug = sanitizeSlug(typeof p.slug === "string" && p.slug.trim() ? p.slug : h1);
    const navLabel = typeof p.navLabel === "string" && p.navLabel.trim() ? p.navLabel.trim() : h1;
    const pageKeywords = Array.isArray(p.keywords)
      ? (p.keywords as unknown[])
          .filter((k): k is string => typeof k === "string" && k.trim() !== "")
          .map((k) => k.trim())
      : [];

    pages.push({ slug, h1, headings, navLabel, keywords: pageKeywords });
  }

  if (pages.length === 0) {
    throw new Error("Formato de respuesta de IA inválido (estructura mal formada)");
  }

  return { pages };
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
  const client = getOpenRouterClient();
  const model = DEFAULT_OPENROUTER_MODEL;

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.3,
    messages: [
      { role: "system", content: buildStructureSystemPrompt() },
      { role: "user", content: buildStructureUserMessage(params.studyName, params.keywords) },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Sin respuesta del modelo");

  const structure = parseStructure(raw);
  return { structure, model, usage: completion.usage };
}
