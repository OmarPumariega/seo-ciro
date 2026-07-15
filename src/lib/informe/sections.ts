// Secciones del informe, compartidas entre la ruta de configuración, la página
// del informe (server) y el builder (cliente). Única fuente de verdad para las
// claves, el orden por defecto y las etiquetas visibles.

export type SectionKey =
  | "tasks"
  | "audit"
  | "rank"
  | "keywords"
  | "arquitectura"
  | "titulos-meta"
  | "schema"
  | "contenido"
  | "google"
  | "canibalizaciones"
  | "geogrid"
  | "links"
  | "competitors"
  | "costs";

// Orden por defecto = orden de render si el proyecto no ha reordenado.
export const SECTION_KEYS: SectionKey[] = [
  "tasks",
  "audit",
  "rank",
  "keywords",
  "arquitectura",
  "titulos-meta",
  "schema",
  "contenido",
  "google",
  "canibalizaciones",
  "geogrid",
  "links",
  "competitors",
  "costs",
];

export const SECTION_LABELS: Record<SectionKey, string> = {
  tasks: "Trabajos realizados",
  audit: "Salud técnica (auditoría)",
  rank: "Posicionamiento",
  keywords: "Keywords",
  arquitectura: "Arquitectura de URLs",
  "titulos-meta": "Título y Meta",
  schema: "Schema",
  contenido: "Contenido",
  google: "Google (Search Console)",
  canibalizaciones: "Canibalizaciones",
  geogrid: "SEO Local (geogrid)",
  links: "Enlaces internos",
  competitors: "Competidores",
  costs: "Costes",
};

export type ReportSections = Record<SectionKey, boolean>;

export const DEFAULT_SECTIONS: ReportSections = SECTION_KEYS.reduce((acc, k) => {
  acc[k] = true;
  return acc;
}, {} as ReportSections);

export const DEFAULT_ORDER: SectionKey[] = [...SECTION_KEYS];

// Normaliza la config guardada al shape actual { sections, order } con back-compat:
// acepta el shape viejo (solo `sections` objeto de bool) y rellena claves nuevas.
export type NormalizedConfig = {
  sections: ReportSections;
  order: SectionKey[];
};

export function normalizeReportConfig(raw: unknown): NormalizedConfig {
  const sections: ReportSections = { ...DEFAULT_SECTIONS };
  let order: SectionKey[] = [...DEFAULT_ORDER];

  if (raw && typeof raw === "object") {
    const obj = raw as { sections?: unknown; order?: unknown };

    // sections: puede ser objeto de bool (viejo o nuevo) — rellena lo conocido.
    if (obj.sections && typeof obj.sections === "object") {
      const stored = obj.sections as Record<string, unknown>;
      for (const k of SECTION_KEYS) {
        if (typeof stored[k] === "boolean") sections[k] = stored[k];
      }
    }

    // order: array de claves válidas (si viene y es una permutación completa).
    if (Array.isArray(obj.order) && obj.order.length === SECTION_KEYS.length) {
      const valid = obj.order.filter((k): k is SectionKey =>
        typeof k === "string" && (SECTION_KEYS as string[]).includes(k)
      );
      if (valid.length === SECTION_KEYS.length) order = valid;
    }
  }

  return { sections, order };
}
