import type { Project } from "@prisma/client";
import type OpenAI from "openai";
import { getOpenRouterClient, DEFAULT_OPENROUTER_MODEL } from "@/lib/seo/llm";
import type { ScrapedPage } from "@/lib/seo/scrape";

export const SCHEMA_TYPES = ["LocalBusiness", "Article", "FAQPage"] as const;
export type SchemaType = (typeof SCHEMA_TYPES)[number];

type NapProject = Pick<Project, "isLocalBusiness" | "businessName" | "address" | "phone">;

const INTERROGATIVE_HEADING = /^(cómo|qué|por qué|cuánto|cuánta|dónde|cuál|cuáles)\b/i;

export function suggestSchemaType(project: NapProject, scraped: ScrapedPage): SchemaType {
  // Las señales de contenido (FAQ / artículo con fecha de publicación) tienen
  // prioridad sobre el flag del proyecto: un negocio local también publica
  // blog o FAQ, y esas páginas no deben sugerir siempre LocalBusiness solo
  // porque el proyecto lo sea. LocalBusiness queda como fallback para
  // páginas sin estructura de artículo (home, contacto, servicios...).
  const interrogativeHeadings = scraped.headings.filter(
    (h) => INTERROGATIVE_HEADING.test(h.text) || h.text.trim().endsWith("?")
  );
  if (interrogativeHeadings.length >= 2) return "FAQPage";

  if (scraped.articleMeta.publishedTime) return "Article";

  if (project.isLocalBusiness && project.businessName) return "LocalBusiness";

  return "Article";
}

// Determinista, sin LLM: mapeo directo de los datos NAP del proyecto. Omite
// deliberadamente `openingHours`/`openingHoursSpecification` porque
// `Project.hours` se guarda como texto libre, no estructurado por día —
// schema.org exige un formato estructurado y no se inventa uno.
export function buildLocalBusinessJsonLd(
  project: NapProject,
  scraped: ScrapedPage,
  url: string
): Record<string, unknown> {
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

const ARTICLE_SYSTEM_PROMPT = `Eres un asistente de SEO técnico. A partir del contenido extraído de una página web, debes devolver ÚNICAMENTE un objeto JSON (sin markdown, sin explicaciones) con esta forma exacta:

{"headline": string, "description": string, "author": string | null, "datePublished": string | null}

Reglas estrictas:
- "headline": resume el tema del artículo en máximo 110 caracteres. Basado en el título/H1/contenido real, nunca inventado.
- "description": 1-2 frases que resuman el contenido real de la página.
- "author": el nombre de la persona autora SOLO si aparece explícitamente en el contenido (ej. "Escrito por..."). Si no aparece, devuelve null. Nunca inventes un nombre.
- "datePublished": una fecha en formato ISO 8601 (YYYY-MM-DD) SOLO si aparece explícitamente en el contenido visible. Si no aparece, devuelve null. Nunca inventes una fecha.
- No incluyas ningún otro campo ni texto fuera del JSON.`;

const FAQ_SYSTEM_PROMPT = `Eres un asistente de SEO técnico. A partir del contenido extraído de una página web, identifica únicamente las preguntas y respuestas que aparecen realmente en el contenido (secciones de FAQ, encabezados en forma de pregunta seguidos de su respuesta). Devuelve ÚNICAMENTE un objeto JSON (sin markdown, sin explicaciones) con esta forma exacta:

{"items": [{"question": string, "answer": string}]}

Reglas estrictas:
- Solo incluye pares pregunta/respuesta que estén realmente presentes en el contenido proporcionado. Nunca inventes preguntas ni respuestas que no aparezcan.
- Si no encuentras ningún par pregunta/respuesta claro en el contenido, devuelve {"items": []}.
- No incluyas ningún otro campo ni texto fuera del JSON.`;

function buildScrapedContext(url: string, scraped: ScrapedPage): string {
  const headingsText = scraped.headings.map((h) => `${h.tag.toUpperCase()}: ${h.text}`).join("\n");
  return `URL: ${url}

Título: ${scraped.title}
H1: ${scraped.h1}
Encabezados:
${headingsText || "(ninguno)"}

Contenido:
${scraped.bodyText}`;
}

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(json)?\n?/i, "")
    .replace(/```$/, "")
    .trim();
}

export type ArticleOrFaqResult = {
  jsonLd: Record<string, unknown>;
  model: string;
  usage: OpenAI.CompletionUsage | undefined;
};

export async function buildArticleOrFaqJsonLd(
  type: "Article" | "FAQPage",
  scraped: ScrapedPage,
  url: string
): Promise<ArticleOrFaqResult> {
  const client = getOpenRouterClient();
  const model = DEFAULT_OPENROUTER_MODEL;

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    messages: [
      { role: "system", content: type === "Article" ? ARTICLE_SYSTEM_PROMPT : FAQ_SYSTEM_PROMPT },
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

  const jsonLd: Record<string, unknown> =
    type === "Article"
      ? buildArticleJsonLd(parsed, scraped, url)
      : buildFaqJsonLd(parsed, url);

  return { jsonLd, model, usage: completion.usage };
}

// Los datos ya extraídos de forma determinista del HTML (fecha/autor por
// metaetiqueta) tienen prioridad sobre lo que devuelva el modelo — reduce el
// riesgo de que el LLM invente cuando el dato real ya se conocía.
function buildArticleJsonLd(
  parsed: Record<string, unknown>,
  scraped: ScrapedPage,
  url: string
): Record<string, unknown> {
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Article",
    url,
  };
  if (typeof parsed.headline === "string" && parsed.headline.trim()) {
    jsonLd.headline = parsed.headline.trim();
  }
  if (typeof parsed.description === "string" && parsed.description.trim()) {
    jsonLd.description = parsed.description.trim();
  }

  const author = scraped.articleMeta.author || (typeof parsed.author === "string" ? parsed.author : null);
  if (author) jsonLd.author = { "@type": "Person", name: author };

  const datePublished =
    scraped.articleMeta.publishedTime ||
    (typeof parsed.datePublished === "string" ? parsed.datePublished : null);
  if (datePublished && !Number.isNaN(Date.parse(datePublished))) {
    jsonLd.datePublished = datePublished;
  }

  return jsonLd;
}

function buildFaqJsonLd(parsed: Record<string, unknown>, url: string): Record<string, unknown> {
  const items = Array.isArray(parsed.items) ? parsed.items : [];
  const mainEntity = items
    .filter(
      (item): item is { question: string; answer: string } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).question === "string" &&
        typeof (item as Record<string, unknown>).answer === "string"
    )
    .map((item) => ({
      "@type": "Question",
      name: item.question.trim(),
      acceptedAnswer: { "@type": "Answer", text: item.answer.trim() },
    }));

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    url,
    mainEntity,
  };
}

export function validateJsonLd(
  type: SchemaType,
  jsonLd: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (jsonLd["@context"] !== "https://schema.org") errors.push('Falta "@context": "https://schema.org"');
  if (jsonLd["@type"] !== type) errors.push(`"@type" debe ser "${type}"`);

  if (type === "LocalBusiness") {
    if (!isNonEmptyString(jsonLd.name)) errors.push('Falta "name"');
    const hasAddress = typeof jsonLd.address === "object" && jsonLd.address !== null;
    const hasPhone = isNonEmptyString(jsonLd.telephone);
    if (!hasAddress && !hasPhone) errors.push('Falta "address" o "telephone" (al menos uno)');
  }

  if (type === "Article") {
    if (!isNonEmptyString(jsonLd.headline)) errors.push('Falta "headline"');
    else if ((jsonLd.headline as string).length > 110) errors.push('"headline" supera los 110 caracteres recomendados');
    if (jsonLd.datePublished && Number.isNaN(Date.parse(jsonLd.datePublished as string))) {
      errors.push('"datePublished" no es una fecha ISO válida');
    }
  }

  if (type === "FAQPage") {
    const mainEntity = jsonLd.mainEntity;
    if (!Array.isArray(mainEntity) || mainEntity.length === 0) {
      errors.push('"mainEntity" debe ser un array con al menos una pregunta');
    } else {
      mainEntity.forEach((item, i) => {
        if (item?.["@type"] !== "Question" || !isNonEmptyString(item?.name)) {
          errors.push(`Elemento ${i + 1} de "mainEntity": falta "name" o "@type" incorrecto`);
        }
        if (item?.acceptedAnswer?.["@type"] !== "Answer" || !isNonEmptyString(item?.acceptedAnswer?.text)) {
          errors.push(`Elemento ${i + 1} de "mainEntity": "acceptedAnswer" incompleto`);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
