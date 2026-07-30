import { postTask } from "@/lib/dataforseo/client";

// Análisis on-page de UNA URL vía DataForSEO On-Page API, modo Live
// (`instant_pages` — un único POST, sin crear/consultar una tarea de crawl).
// `enable_javascript: true` porque son páginas de terceros (competidores)
// que no controlamos y pueden depender de JS para renderizar el contenido
// real — sin esto, un sitio hecho con un framework JS se vería vacío.
//
// Respuesta verificada contra la API real (no solo documentación): el nivel
// `checks` es un objeto de banderas booleanas (no_h1_tag, title_too_long,
// duplicate_meta_tags, low_readability_rate...) — aquí nos quedamos solo con
// las que están a `true`. `meta.htags` trae los niveles de encabezado
// realmente presentes en la página (h1, h2, h3... hasta h6 si existen).
// La API NO da recuento de frases (solo palabras/caracteres) ni cuenta
// exacta de imágenes sin alt o enlaces rotos (solo booleanos) — reflejado
// tal cual en el tipo de salida, sin inventar números que no vienen.

export type OnPageResult = {
  costUsd: number | null;
  onPageScore: number | null;
  wordCount: number | null;
  characterCount: number | null;
  titleLength: number | null;
  descriptionLength: number | null;
  htags: Record<string, string[]> | null;
  issues: string[];
  readability: {
    automatedReadabilityIndex: number | null;
    colemanLiauReadabilityIndex: number | null;
    daleChallReadabilityIndex: number | null;
    fleschKincaidReadabilityIndex: number | null;
    smogReadabilityIndex: number | null;
  } | null;
  imagesCount: number | null;
  internalLinksCount: number | null;
  externalLinksCount: number | null;
  hasBrokenLinks: boolean | null;
};

type OnPageItem = {
  onpage_score?: number;
  broken_links?: boolean;
  meta?: {
    title_length?: number;
    description_length?: number;
    images_count?: number;
    internal_links_count?: number;
    external_links_count?: number;
    htags?: Record<string, string[]>;
    content?: {
      plain_text_word_count?: number;
      plain_text_size?: number;
      automated_readability_index?: number;
      coleman_liau_readability_index?: number;
      dale_chall_readability_index?: number;
      flesch_kincaid_readability_index?: number;
      smog_readability_index?: number;
    };
  };
  checks?: Record<string, boolean>;
};

export async function fetchInstantPageAnalysis(url: string): Promise<OnPageResult> {
  const task = await postTask("/v3/on_page/instant_pages", { url, enable_javascript: true }, "onpage");

  const resultArr = Array.isArray(task.result) ? (task.result as Array<Record<string, unknown>>) : [];
  const items = Array.isArray(resultArr[0]?.items) ? (resultArr[0]!.items as OnPageItem[]) : [];
  const item = items[0] ?? {};
  const content = item.meta?.content ?? {};
  const checks = item.checks ?? {};

  const issues = Object.entries(checks)
    .filter(([, value]) => value === true)
    .map(([key]) => key);

  const hasReadability =
    content.automated_readability_index !== undefined ||
    content.coleman_liau_readability_index !== undefined ||
    content.dale_chall_readability_index !== undefined ||
    content.flesch_kincaid_readability_index !== undefined ||
    content.smog_readability_index !== undefined;

  return {
    costUsd: typeof task.cost === "number" ? task.cost : null,
    onPageScore: typeof item.onpage_score === "number" ? item.onpage_score : null,
    wordCount: typeof content.plain_text_word_count === "number" ? content.plain_text_word_count : null,
    characterCount: typeof content.plain_text_size === "number" ? content.plain_text_size : null,
    titleLength: typeof item.meta?.title_length === "number" ? item.meta.title_length : null,
    descriptionLength: typeof item.meta?.description_length === "number" ? item.meta.description_length : null,
    htags: item.meta?.htags ?? null,
    issues,
    readability: hasReadability
      ? {
          automatedReadabilityIndex: content.automated_readability_index ?? null,
          colemanLiauReadabilityIndex: content.coleman_liau_readability_index ?? null,
          daleChallReadabilityIndex: content.dale_chall_readability_index ?? null,
          fleschKincaidReadabilityIndex: content.flesch_kincaid_readability_index ?? null,
          smogReadabilityIndex: content.smog_readability_index ?? null,
        }
      : null,
    imagesCount: typeof item.meta?.images_count === "number" ? item.meta.images_count : null,
    internalLinksCount: typeof item.meta?.internal_links_count === "number" ? item.meta.internal_links_count : null,
    externalLinksCount: typeof item.meta?.external_links_count === "number" ? item.meta.external_links_count : null,
    hasBrokenLinks: typeof item.broken_links === "boolean" ? item.broken_links : null,
  };
}
