import type OpenAI from "openai";
import { getOpenRouterClient, getDefaultOpenRouterModel } from "@/lib/seo/llm";
import { stripCodeFences } from "@/lib/seo/json";
import type { ScrapedPage } from "@/lib/seo/scrape";
import type { CatalogEntry, SchemaProp, SchemaProject } from "@/lib/seo/schema/catalog";

// Generación de JSON-LD. Dos estrategias declaradas en el catálogo:
//  - deterministic: derivada 100% del proyecto/página, sin coste de IA.
//  - llm: un ÚNICO builder genérico que recibe la definición schema.org del tipo
//    (sus propiedades reales) y el contenido scrapeado, y rellena solo lo que
//    exista. Nunca inventa datos. Añadir tipos no toca esta lógica.

export type DeterministicContext = {
  project: SchemaProject;
  scraped: ScrapedPage;
  url: string;
};

export type LlmResult = {
  jsonLd: Record<string, unknown>;
  model: string;
  usage: OpenAI.CompletionUsage | undefined;
};

// --- Deterministas ------------------------------------------------------------

// LocalBusiness: mapeo directo del NAP del proyecto. Omite deliberadamente
// openingHours porque Project.hours es texto libre y schema.org exige un
// formato estructurado que no se puede inventar.
function buildLocalBusiness(ctx: DeterministicContext): Record<string, unknown> {
  const { project, scraped, url } = ctx;
  if (!project.isLocalBusiness || !project.businessName) {
    throw new Error(
      "Este proyecto no tiene datos NAP configurados. Complétalos en la ficha del proyecto antes de generar un schema LocalBusiness."
    );
  }
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: project.businessName,
    url,
  };
  if (scraped.metaDescription) jsonLd.description = scraped.metaDescription;
  if (project.address) {
    jsonLd.address = { "@type": "PostalAddress", streetAddress: project.address };
  }
  if (project.phone) jsonLd.telephone = project.phone;
  return jsonLd;
}

function siteOrigin(project: SchemaProject, url: string): string {
  if (project.domain) return `https://${project.domain.replace(/^\/+/, "")}`;
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

function buildOrganization(ctx: DeterministicContext): Record<string, unknown> {
  const { project, scraped, url } = ctx;
  const name = project.businessName || project.name;
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name,
    url: siteOrigin(project, url),
  };
  if (scraped.metaDescription) jsonLd.description = scraped.metaDescription;
  return jsonLd;
}

function buildWebsite(ctx: DeterministicContext): Record<string, unknown> {
  const { project, scraped, url } = ctx;
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: project.businessName || project.name,
    url: siteOrigin(project, url),
  };
  if (scraped.metaDescription) jsonLd.description = scraped.metaDescription;
  return jsonLd;
}

function humanizeSegment(seg: string): string {
  const noExt = seg.replace(/\.(html?|php|aspx?)$/i, "");
  return decodeURIComponent(noExt)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

// Migas de pan derivadas de los segmentos de la URL + título de la página.
function buildBreadcrumb(ctx: DeterministicContext): Record<string, unknown> {
  const { scraped, url } = ctx;
  const base = scraped.canonicalUrl || url;
  let origin: string;
  let pathname: string;
  try {
    const u = new URL(base);
    origin = u.origin;
    pathname = u.pathname;
  } catch {
    origin = base;
    pathname = "";
  }
  const segments = pathname.split("/").map((s) => s).filter(Boolean);
  const items: { name: string; item: string }[] = [{ name: "Inicio", item: origin }];
  let acc = origin;
  segments.forEach((seg, i) => {
    acc += "/" + decodeURIComponent(seg);
    const isLast = i === segments.length - 1;
    const name = isLast ? scraped.h1 || scraped.title || humanizeSegment(seg) : humanizeSegment(seg);
    items.push({ name, item: acc });
  });

  const itemListElement = items.map((it, i) => ({
    "@type": "ListItem",
    position: i + 1,
    name: it.name,
    item: it.item,
  }));

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement,
  };
}

const DETERMINISTIC_BUILDERS: Record<string, (ctx: DeterministicContext) => Record<string, unknown>> = {
  LocalBusiness: buildLocalBusiness,
  Organization: buildOrganization,
  WebSite: buildWebsite,
  BreadcrumbList: buildBreadcrumb,
};

export function buildDeterministic(type: string, ctx: DeterministicContext): Record<string, unknown> {
  const fn = DETERMINISTIC_BUILDERS[type];
  if (!fn) throw new Error(`El tipo "${type}" no tiene generador determinista`);
  return fn(ctx);
}

// --- LLM genérico -------------------------------------------------------------

function buildScrapedContext(url: string, scraped: ScrapedPage): string {
  const headingsText = scraped.headings.map((h) => `${h.tag.toUpperCase()}: ${h.text}`).join("\n");
  return `URL: ${url}

Título: ${scraped.title}
H1: ${scraped.h1}
Meta descripción: ${scraped.metaDescription || "(ninguna)"}
Autor (meta): ${scraped.articleMeta.author || "(no aparece)"}
Fecha de publicación (meta): ${scraped.articleMeta.publishedTime || "(no aparece)"}

Encabezados:
${headingsText || "(ninguno)"}

Contenido:
${scraped.bodyText}`;
}

function levelLabel(level: SchemaProp["level"]): string {
  return level === "required" ? "OBLIGATORIA" : level === "recommended" ? "RECOMENDADA" : "OPCIONAL";
}

function describeProp(prop: SchemaProp, indent: string): string {
  const cardinality = prop.multiple ? " (lista de valores)" : "";
  const head = `${indent}- ${prop.name} (${prop.type}${cardinality}) [${levelLabel(prop.level)}]: ${prop.desc}`;
  if (!prop.nestedType || !prop.nested) return head;
  const sub = prop.nested
    .map((c) => describeProp(c, indent + "    "))
    .join("\n");
  return `${head}\n${indent}    → Cada uno debe incluir "@type": "${prop.nestedType}" y estas sub-propiedades:\n${sub}`;
}

function buildSystemPrompt(entry: CatalogEntry): string {
  const propsBlock = entry.properties.map((p) => describeProp(p, "")).join("\n");
  return `Eres un asistente de SEO técnico. A partir del contenido extraído de una página web, debes generar datos estructurados JSON-LD para el tipo "${entry.type}" de schema.org.

Especificación de propiedades (fuente: ${entry.url}):
${propsBlock}

Reglas ESTRICTAS:
- Rellena cada propiedad ÚNICAMENTE con datos que aparezcan realmente en el contenido proporcionado. Si un dato no aparece en la página, OMITE esa propiedad (no la incluyas en el JSON). 
- NUNCA inventes datos (precios, fechas, autores, valoraciones, direcciones, ingredientes...) que no existan en el contenido.
- Devuelve ÚNICAMENTE un objeto JSON válido, sin markdown ni texto fuera del objeto.
- Para propiedades con sub-propiedades, incluye "@type": "<tipo indicado>" y sus sub-propiedades. Para las listas, devuelve un array de objetos.
- No incluyas "@context" ni el "@type" raíz: se añaden después automáticamente.
- Las fechas van en ISO 8601 (YYYY-MM-DD). Las duraciones en formato ISO 8601 (p.ej. PT30M).
- Para los enums (availability, eventStatus, employmentType...), usa el valor completo de schema.org (https://schema.org/InStock).`;
}

// Asegura que los objetos anidados lleven su @type según el catálogo, de forma
// recursiva. El LLM ya debería incluirlo, pero no se confía ciegamente. Mutua el
// objeto in place.
function injectNestedTypes(obj: Record<string, unknown>, props: SchemaProp[]): void {
  for (const prop of props) {
    if (!(prop.name in obj)) continue;
    const v = obj[prop.name];
    if (v === null || v === undefined) continue;
    if (!prop.nestedType) continue;

    const arr = prop.multiple ? (Array.isArray(v) ? v : []) : [v];
    for (const item of arr) {
      if (item && typeof item === "object" && !Array.isArray(item)) {
        const o = item as Record<string, unknown>;
        if (!o["@type"]) o["@type"] = prop.nestedType;
        if (prop.nested) injectNestedTypes(o, prop.nested);
      }
    }
  }
}

export async function buildLlmJsonLd(
  entry: CatalogEntry,
  scraped: ScrapedPage,
  url: string
): Promise<LlmResult> {
  const client = await getOpenRouterClient();
  const model = await getDefaultOpenRouterModel();

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: buildSystemPrompt(entry) },
      { role: "user", content: buildScrapedContext(url, scraped) },
    ],
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("Sin respuesta del modelo");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    throw new Error("Formato de respuesta de IA inválido (JSON mal formado)");
  }

  // El modelo no debe incluir @context/@type raíz; por seguridad se eliminan
  // y se fijan los correctos. Luego se asegura el @type de los anidados.
  delete parsed["@context"];
  delete parsed["@type"];
  injectNestedTypes(parsed, entry.properties);

  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": entry.type,
    url,
    ...parsed,
  };

  return { jsonLd, model, usage: completion.usage };
}
