import type { Project } from "@prisma/client";
import type { ScrapedPage } from "@/lib/seo/scrape";

// Catálogo data-driven de tipos de schema.org soportados. Única fuente de
// verdad consumida por backend (generación + validación) y por la UI (combobox).
// Cada entrada declara el @type exacto, sus propiedades reales de schema.org
// (nivel según Google rich results) y si se genera de forma determinista
// (derivada del proyecto/página, sin coste) o vía LLM.
//
// Añadir un tipo = añadir una entrada. No hay que tocar builders, prompts ni
// validadores dedicados: el builder LLM genérico y el validador genérico leen
// esta definición. Los tipos deterministas tienen su builder en generators.ts.

export type PropLevel = "required" | "recommended" | "optional";

export type SchemaProp = {
  name: string;
  type: string; // tipo esperado de schema.org ("Text"|"Number"|"Date"|"URL"|"Offer"|"Person"...)
  level: PropLevel;
  desc: string;
  multiple?: boolean; // la propiedad es un array del tipo indicado
  maxLength?: number;
  nestedType?: string; // @type del objeto anidado (cuando type es un tipo schema.org)
  nested?: SchemaProp[]; // sub-propiedades (1 nivel basta para SEO)
};

export type CatalogEntry = {
  type: string; // @type exacto
  label: string;
  category: string;
  generator: "deterministic" | "llm";
  url: string; // https://schema.org/<Type> — fuente verificable
  description: string;
  properties: SchemaProp[];
};

export const SCHEMA_CATEGORIES = [
  "Contenido",
  "Comercio",
  "Guías y Q&A",
  "Eventos",
  "Local y organización",
  "Personas",
  "Otros",
] as const;

// Sub-definiciones reutilizables ------------------------------------------------

const PERSON_PROP: SchemaProp = {
  name: "author",
  type: "Person",
  level: "recommended",
  desc: "Persona autora, solo si aparece explícitamente en el contenido",
  nestedType: "Person",
  nested: [{ name: "name", type: "Text", level: "required", desc: "Nombre de la persona" }],
};

const IMAGE_PROP: SchemaProp = {
  name: "image",
  type: "URL",
  level: "recommended",
  desc: "URL de una imagen representativa de la página",
};

// Catálogo ---------------------------------------------------------------------

export const SCHEMA_CATALOG: CatalogEntry[] = [
  // --- Contenido ---
  {
    type: "Article",
    label: "Article — Artículo",
    category: "Contenido",
    generator: "llm",
    url: "https://schema.org/Article",
    description: "Artículo genérico. No genera rich result propio, pero ayuda a Google a entender el contenido.",
    properties: [
      { name: "headline", type: "Text", level: "required", desc: "Titular del artículo", maxLength: 110 },
      { name: "description", type: "Text", level: "recommended", desc: "Resumen breve del contenido" },
      PERSON_PROP,
      { name: "datePublished", type: "Date", level: "recommended", desc: "Fecha de publicación (ISO 8601)" },
      { name: "dateModified", type: "Date", level: "optional", desc: "Fecha de última modificación" },
      IMAGE_PROP,
      { name: "articleBody", type: "Text", level: "optional", desc: "Cuerpo del artículo" },
    ],
  },
  {
    type: "NewsArticle",
    label: "NewsArticle — Noticia",
    category: "Contenido",
    generator: "llm",
    url: "https://schema.org/NewsArticle",
    description: "Noticia. Datos obligatorios más estrictos para aparecer en Google Noticias.",
    properties: [
      { name: "headline", type: "Text", level: "required", desc: "Titular", maxLength: 110 },
      { name: "datePublished", type: "Date", level: "required", desc: "Fecha de publicación" },
      PERSON_PROP,
      IMAGE_PROP,
      { name: "dateline", type: "Text", level: "optional", desc: "Ciudad y fecha de la noticia" },
      { name: "dateModified", type: "Date", level: "optional", desc: "Fecha de última modificación" },
      { name: "articleSection", type: "Text", level: "optional", desc: "Sección (deportes, economía...)" },
    ],
  },
  {
    type: "BlogPosting",
    label: "BlogPosting — Entrada de blog",
    category: "Contenido",
    generator: "llm",
    url: "https://schema.org/BlogPosting",
    description: "Entrada de blog. Variante de Article pensada para publicaciones periódicas.",
    properties: [
      { name: "headline", type: "Text", level: "required", desc: "Titular de la entrada", maxLength: 110 },
      { name: "datePublished", type: "Date", level: "recommended", desc: "Fecha de publicación" },
      PERSON_PROP,
      IMAGE_PROP,
      { name: "description", type: "Text", level: "optional", desc: "Resumen breve" },
      { name: "articleBody", type: "Text", level: "optional", desc: "Cuerpo de la entrada" },
    ],
  },
  {
    type: "WebPage",
    label: "WebPage — Página",
    category: "Contenido",
    generator: "llm",
    url: "https://schema.org/WebPage",
    description: "Página genérica (home, servicios, contacto...). Sirve cuando no aplica un tipo más específico.",
    properties: [
      { name: "name", type: "Text", level: "recommended", desc: "Título de la página" },
      { name: "description", type: "Text", level: "recommended", desc: "Descripción breve" },
      {
        name: "primaryImageOfPage",
        type: "ImageObject",
        level: "optional",
        desc: "Imagen principal de la página",
        nestedType: "ImageObject",
        nested: [{ name: "url", type: "URL", level: "recommended", desc: "URL de la imagen" }],
      },
      { name: "datePublished", type: "Date", level: "optional", desc: "Fecha de publicación" },
      { name: "dateModified", type: "Date", level: "optional", desc: "Fecha de última modificación" },
    ],
  },
  // --- Comercio ---
  {
    type: "Product",
    label: "Product — Producto",
    category: "Comercio",
    generator: "llm",
    url: "https://schema.org/Product",
    description: "Producto a la venta. Genera fichas de producto con precio y valoraciones en los resultados.",
    properties: [
      { name: "name", type: "Text", level: "required", desc: "Nombre del producto" },
      { name: "description", type: "Text", level: "recommended", desc: "Descripción del producto" },
      IMAGE_PROP,
      { name: "brand", type: "Brand", level: "recommended", desc: "Marca", nestedType: "Brand", nested: [{ name: "name", type: "Text", level: "required", desc: "Nombre de la marca" }] },
      { name: "sku", type: "Text", level: "recommended", desc: "SKU o identificador del producto" },
      {
        name: "offers",
        type: "Offer",
        level: "recommended",
        desc: "Oferta del producto (precio, divisa, disponibilidad)",
        nestedType: "Offer",
        nested: [
          { name: "price", type: "Number", level: "required", desc: "Precio" },
          { name: "priceCurrency", type: "Text", level: "required", desc: "Divisa en ISO 4217 (EUR, USD...)" },
          { name: "availability", type: "ItemAvailability", level: "recommended", desc: "https://schema.org/InStock, OutOfStock..." },
        ],
      },
      {
        name: "aggregateRating",
        type: "AggregateRating",
        level: "optional",
        desc: "Valoración media agregada",
        nestedType: "AggregateRating",
        nested: [
          { name: "ratingValue", type: "Number", level: "required", desc: "Valoración media" },
          { name: "reviewCount", type: "Number", level: "recommended", desc: "Número de reseñas" },
          { name: "bestRating", type: "Number", level: "recommended", desc: "Mejor valoración posible (suele ser 5)" },
        ],
      },
    ],
  },
  {
    type: "Review",
    label: "Review — Reseña",
    category: "Comercio",
    generator: "llm",
    url: "https://schema.org/Review",
    description: "Reseña de un producto, servicio o negocio. Genera estrellas en los resultados.",
    properties: [
      {
        name: "itemReviewed",
        type: "Thing",
        level: "required",
        desc: "Elemento reseñado (producto, local...)",
        nestedType: "Thing",
        nested: [{ name: "name", type: "Text", level: "required", desc: "Nombre de lo reseñado" }],
      },
      PERSON_PROP,
      {
        name: "reviewRating",
        type: "Rating",
        level: "recommended",
        desc: "Puntuación de la reseña",
        nestedType: "Rating",
        nested: [
          { name: "ratingValue", type: "Number", level: "required", desc: "Puntuación" },
          { name: "bestRating", type: "Number", level: "recommended", desc: "Puntuación máxima (suele ser 5)" },
        ],
      },
      { name: "reviewBody", type: "Text", level: "optional", desc: "Texto de la reseña" },
      { name: "datePublished", type: "Date", level: "optional", desc: "Fecha de la reseña" },
    ],
  },
  // --- Guías y Q&A ---
  {
    type: "FAQPage",
    label: "FAQPage — Preguntas frecuentes",
    category: "Guías y Q&A",
    generator: "llm",
    url: "https://schema.org/FAQPage",
    description: "Página de preguntas y respuestas. Genera resultados desplegables en Google.",
    properties: [
      {
        name: "mainEntity",
        type: "Question",
        level: "required",
        multiple: true,
        desc: "Preguntas y respuestas que aparecen realmente en la página",
        nestedType: "Question",
        nested: [
          { name: "name", type: "Text", level: "required", desc: "La pregunta" },
          {
            name: "acceptedAnswer",
            type: "Answer",
            level: "required",
            desc: "Respuesta aceptada",
            nestedType: "Answer",
            nested: [{ name: "text", type: "Text", level: "required", desc: "Texto de la respuesta" }],
          },
        ],
      },
    ],
  },
  {
    type: "HowTo",
    label: "HowTo — Cómo hacerlo",
    category: "Guías y Q&A",
    generator: "llm",
    url: "https://schema.org/HowTo",
    description: "Guía paso a paso. Genera instrucciones desplegables en los resultados.",
    properties: [
      { name: "name", type: "Text", level: "required", desc: "Título de la guía" },
      { name: "description", type: "Text", level: "recommended", desc: "Resumen" },
      { name: "totalTime", type: "Duration", level: "optional", desc: "Tiempo total (ISO 8601, p.ej. PT30M)" },
      {
        name: "step",
        type: "HowToStep",
        level: "required",
        multiple: true,
        desc: "Pasos de la guía",
        nestedType: "HowToStep",
        nested: [{ name: "text", type: "Text", level: "required", desc: "Texto del paso" }],
      },
    ],
  },
  {
    type: "Recipe",
    label: "Recipe — Receta",
    category: "Guías y Q&A",
    generator: "llm",
    url: "https://schema.org/Recipe",
    description: "Receta de cocina. Genera ficha enriquecida con ingredientes, tiempo y valoración.",
    properties: [
      { name: "name", type: "Text", level: "required", desc: "Nombre de la receta" },
      { name: "recipeIngredient", type: "Text", level: "required", multiple: true, desc: "Lista de ingredientes" },
      {
        name: "recipeInstructions",
        type: "HowToStep",
        level: "required",
        multiple: true,
        desc: "Pasos de la receta",
        nestedType: "HowToStep",
        nested: [{ name: "text", type: "Text", level: "required", desc: "Texto del paso" }],
      },
      { name: "prepTime", type: "Duration", level: "recommended", desc: "Tiempo de preparación (ISO 8601)" },
      { name: "cookTime", type: "Duration", level: "recommended", desc: "Tiempo de cocción (ISO 8601)" },
      { name: "recipeYield", type: "Text", level: "recommended", desc: "Raciones (p.ej. '4 personas')" },
      PERSON_PROP,
    ],
  },
  {
    type: "QAPage",
    label: "QAPage — Página de preguntas y respuestas",
    category: "Guías y Q&A",
    generator: "llm",
    url: "https://schema.org/QAPage",
    description: "Página con una pregunta y sus respuestas (estilo foro). Diferente de FAQPage.",
    properties: [
      {
        name: "mainEntity",
        type: "Question",
        level: "required",
        desc: "Pregunta principal de la página",
        nestedType: "Question",
        nested: [
          { name: "name", type: "Text", level: "required", desc: "La pregunta" },
          { name: "text", type: "Text", level: "recommended", desc: "Detalle de la pregunta" },
          { name: "answerCount", type: "Number", level: "optional", desc: "Número de respuestas" },
          {
            name: "acceptedAnswer",
            type: "Answer",
            level: "recommended",
            desc: "Respuesta aceptada",
            nestedType: "Answer",
            nested: [{ name: "text", type: "Text", level: "required", desc: "Texto de la respuesta" }],
          },
        ],
      },
    ],
  },
  // --- Eventos ---
  {
    type: "Event",
    label: "Event — Evento",
    category: "Eventos",
    generator: "llm",
    url: "https://schema.org/Event",
    description: "Evento. Genera ficha con fecha, lugar y entradas en los resultados.",
    properties: [
      { name: "name", type: "Text", level: "required", desc: "Nombre del evento" },
      { name: "startDate", type: "Date", level: "required", desc: "Fecha/hora de inicio (ISO 8601)" },
      { name: "endDate", type: "Date", level: "recommended", desc: "Fecha/hora de fin" },
      { name: "eventStatus", type: "EventStatusType", level: "recommended", desc: "https://schema.org/EventScheduled..." },
      {
        name: "location",
        type: "Place",
        level: "required",
        desc: "Lugar del evento (físico o virtual)",
        nestedType: "Place",
        nested: [
          { name: "name", type: "Text", level: "recommended", desc: "Nombre del lugar" },
          {
            name: "address",
            type: "PostalAddress",
            level: "recommended",
            desc: "Dirección",
            nestedType: "PostalAddress",
            nested: [{ name: "streetAddress", type: "Text", level: "recommended", desc: "Calle y número" }],
          },
        ],
      },
      { name: "description", type: "Text", level: "recommended", desc: "Descripción del evento" },
      IMAGE_PROP,
    ],
  },
  // --- Local y organización (deterministas) ---
  {
    type: "LocalBusiness",
    label: "LocalBusiness — Negocio local",
    category: "Local y organización",
    generator: "deterministic",
    url: "https://schema.org/LocalBusiness",
    description: "Negocio con ubicación física. Derivado del NAP del proyecto, sin coste de IA.",
    properties: [
      { name: "name", type: "Text", level: "required", desc: "Nombre del negocio" },
      {
        name: "address",
        type: "PostalAddress",
        level: "recommended",
        desc: "Dirección postal",
        nestedType: "PostalAddress",
        nested: [{ name: "streetAddress", type: "Text", level: "recommended", desc: "Calle y número" }],
      },
      { name: "telephone", type: "Text", level: "recommended", desc: "Teléfono" },
      { name: "url", type: "URL", level: "recommended", desc: "URL del negocio" },
      { name: "description", type: "Text", level: "optional", desc: "Descripción" },
    ],
  },
  {
    type: "Organization",
    label: "Organization — Organización",
    category: "Local y organización",
    generator: "deterministic",
    url: "https://schema.org/Organization",
    description: "Empresa u organización. Derivado del nombre y dominio del proyecto, sin coste de IA.",
    properties: [
      { name: "name", type: "Text", level: "required", desc: "Nombre de la organización" },
      { name: "url", type: "URL", level: "recommended", desc: "URL del sitio" },
      { name: "description", type: "Text", level: "optional", desc: "Descripción" },
    ],
  },
  {
    type: "WebSite",
    label: "WebSite — Sitio web",
    category: "Local y organización",
    generator: "deterministic",
    url: "https://schema.org/WebSite",
    description: "El sitio web en su conjunto. Derivado del dominio del proyecto, sin coste de IA.",
    properties: [
      { name: "name", type: "Text", level: "required", desc: "Nombre del sitio" },
      { name: "url", type: "URL", level: "required", desc: "URL del sitio" },
      { name: "description", type: "Text", level: "optional", desc: "Descripción" },
    ],
  },
  {
    type: "BreadcrumbList",
    label: "BreadcrumbList — Migas de pan",
    category: "Local y organización",
    generator: "deterministic",
    url: "https://schema.org/BreadcrumbList",
    description: "Ruta de navegación. Derivada de la URL y el título de la página, sin coste de IA.",
    properties: [
      {
        name: "itemListElement",
        type: "ListItem",
        level: "required",
        multiple: true,
        desc: "Cada nivel de la ruta de navegación",
        nestedType: "ListItem",
        nested: [
          { name: "name", type: "Text", level: "required", desc: "Nombre del nivel" },
          { name: "position", type: "Number", level: "recommended", desc: "Posición (1, 2, 3...)" },
          { name: "item", type: "URL", level: "recommended", desc: "URL del nivel" },
        ],
      },
    ],
  },
  // --- Personas ---
  {
    type: "Person",
    label: "Person — Persona",
    category: "Personas",
    generator: "llm",
    url: "https://schema.org/Person",
    description: "Ficha de una persona (autor, equipo, biografía).",
    properties: [
      { name: "name", type: "Text", level: "required", desc: "Nombre completo" },
      { name: "jobTitle", type: "Text", level: "recommended", desc: "Cargo" },
      { name: "description", type: "Text", level: "recommended", desc: "Biografía breve" },
      IMAGE_PROP,
      {
        name: "worksFor",
        type: "Organization",
        level: "optional",
        desc: "Organización para la que trabaja",
        nestedType: "Organization",
        nested: [{ name: "name", type: "Text", level: "required", desc: "Nombre de la organización" }],
      },
      { name: "sameAs", type: "URL", level: "optional", multiple: true, desc: "URLs de perfiles (LinkedIn, Twitter...)" },
    ],
  },
  // --- Otros ---
  {
    type: "VideoObject",
    label: "VideoObject — Vídeo",
    category: "Otros",
    generator: "llm",
    url: "https://schema.org/VideoObject",
    description: "Vídeo. Genera etiqueta 'Vídeo' y miniatura en los resultados.",
    properties: [
      { name: "name", type: "Text", level: "required", desc: "Título del vídeo" },
      { name: "description", type: "Text", level: "required", desc: "Descripción del vídeo" },
      { name: "thumbnailUrl", type: "URL", level: "required", desc: "URL de la miniatura" },
      { name: "uploadDate", type: "Date", level: "required", desc: "Fecha de subida (ISO 8601)" },
      { name: "contentUrl", type: "URL", level: "recommended", desc: "URL del archivo de vídeo" },
      { name: "embedUrl", type: "URL", level: "recommended", desc: "URL de embed (YouTube, Vimeo...)" },
      { name: "duration", type: "Duration", level: "recommended", desc: "Duración (ISO 8601, p.ej. PT1M30S)" },
    ],
  },
  {
    type: "Course",
    label: "Course — Curso",
    category: "Otros",
    generator: "llm",
    url: "https://schema.org/Course",
    description: "Curso. Genera listado de cursos en los resultados.",
    properties: [
      { name: "name", type: "Text", level: "required", desc: "Nombre del curso" },
      { name: "description", type: "Text", level: "required", desc: "Descripción del curso" },
      {
        name: "provider",
        type: "Organization",
        level: "recommended",
        desc: "Proveedor del curso",
        nestedType: "Organization",
        nested: [{ name: "name", type: "Text", level: "required", desc: "Nombre del proveedor" }],
      },
    ],
  },
  {
    type: "SoftwareApplication",
    label: "SoftwareApplication — App/Software",
    category: "Otros",
    generator: "llm",
    url: "https://schema.org/SoftwareApplication",
    description: "Aplicación o software. Genera ficha de aplicación en los resultados.",
    properties: [
      { name: "name", type: "Text", level: "required", desc: "Nombre de la aplicación" },
      { name: "operatingSystem", type: "Text", level: "recommended", desc: "Sistema operativo (Android, iOS, Web...)" },
      { name: "applicationCategory", type: "Text", level: "recommended", desc: "Categoría (p.ej. BusinessApplication)" },
      { name: "offers", type: "Offer", level: "recommended", desc: "Oferta (precio)", nestedType: "Offer", nested: [{ name: "price", type: "Number", level: "required", desc: "Precio" }, { name: "priceCurrency", type: "Text", level: "required", desc: "Divisa" }] },
    ],
  },
  {
    type: "JobPosting",
    label: "JobPosting — Oferta de empleo",
    category: "Otros",
    generator: "llm",
    url: "https://schema.org/JobPosting",
    description: "Oferta de trabajo. Genera ficha de empleo en los resultados.",
    properties: [
      { name: "title", type: "Text", level: "required", desc: "Título del puesto" },
      { name: "datePosted", type: "Date", level: "required", desc: "Fecha de publicación" },
      { name: "description", type: "Text", level: "required", desc: "Descripción del puesto (HTML o texto)" },
      {
        name: "hiringOrganization",
        type: "Organization",
        level: "required",
        desc: "Empresa que contrata",
        nestedType: "Organization",
        nested: [{ name: "name", type: "Text", level: "required", desc: "Nombre de la empresa" }],
      },
      {
        name: "jobLocation",
        type: "Place",
        level: "required",
        desc: "Ubicación del puesto",
        nestedType: "Place",
        nested: [{ name: "address", type: "PostalAddress", level: "recommended", desc: "Dirección", nestedType: "PostalAddress", nested: [{ name: "streetAddress", type: "Text", level: "recommended", desc: "Calle y número" }] }],
      },
      { name: "employmentType", type: "Text", level: "optional", desc: "Tipo (FULL_TIME, PART_TIME...)" },
    ],
  },
  {
    type: "Book",
    label: "Book — Libro",
    category: "Otros",
    generator: "llm",
    url: "https://schema.org/Book",
    description: "Libro. Genera ficha de libro con autor y valoraciones.",
    properties: [
      { name: "name", type: "Text", level: "required", desc: "Título del libro" },
      PERSON_PROP,
      { name: "isbn", type: "Text", level: "recommended", desc: "ISBN" },
      { name: "numberOfPages", type: "Number", level: "optional", desc: "Número de páginas" },
      { name: "datePublished", type: "Date", level: "recommended", desc: "Fecha de publicación" },
      {
        name: "publisher",
        type: "Organization",
        level: "optional",
        desc: "Editorial",
        nestedType: "Organization",
        nested: [{ name: "name", type: "Text", level: "required", desc: "Nombre de la editorial" }],
      },
    ],
  },
  {
    type: "Service",
    label: "Service — Servicio",
    category: "Otros",
    generator: "llm",
    url: "https://schema.org/Service",
    description: "Servicio ofrecido por una organización (p.ej. una agencia).",
    properties: [
      { name: "name", type: "Text", level: "required", desc: "Nombre del servicio" },
      {
        name: "provider",
        type: "Organization",
        level: "recommended",
        desc: "Quién ofrece el servicio",
        nestedType: "Organization",
        nested: [{ name: "name", type: "Text", level: "required", desc: "Nombre del proveedor" }],
      },
      { name: "serviceType", type: "Text", level: "recommended", desc: "Tipo de servicio" },
      { name: "description", type: "Text", level: "optional", desc: "Descripción" },
      { name: "areaServed", type: "Text", level: "optional", desc: "Área geográfica servida" },
    ],
  },
];

// Helpers ----------------------------------------------------------------------

export function getCatalogEntry(type: string): CatalogEntry | undefined {
  return SCHEMA_CATALOG.find((e) => e.type === type);
}

export function isValidSchemaType(type: string): boolean {
  return SCHEMA_CATALOG.some((e) => e.type === type);
}

// Subconjunto de campos del proyecto que usa la generación de schema.
export type SchemaProject = Pick<
  Project,
  "name" | "domain" | "isLocalBusiness" | "businessName" | "address" | "phone"
>;

// Heurística de sugerencia a partir de señales reales del contenido scrapeado
// y del proyecto. Es orientativa: el usuario siempre puede elegir otro tipo en
// el combobox. Las señales de contenido tienen prioridad sobre el flag del
// proyecto (un negocio local también publica blog/FAQ/receta).
const INTERROGATIVE_HEADING = /^(cómo|qué|por qué|cuánto|cuánta|cuándo|dónde|cuál|cuáles|quién|quiénes)\b/i;
const PRICE_RE = /\b\d+([.,]\d+)?\s?(€|euros|eur|usd|\$)\b/i;

export function suggestSchemaType(project: SchemaProject, scraped: ScrapedPage): string {
  const interrogativeHeadings = scraped.headings.filter(
    (h) => INTERROGATIVE_HEADING.test(h.text) || h.text.trim().endsWith("?")
  );
  if (interrogativeHeadings.length >= 2) return "FAQPage";

  const text = scraped.bodyText.toLowerCase();

  if (/ingredientes\b/.test(text) && /(preparación|preparacion|elaboración|elaboracion|receta)\b/.test(text)) {
    return "Recipe";
  }
  if (/paso\s+\d|instrucciones|guía paso a paso|guia paso a paso/i.test(text)) {
    return "HowTo";
  }
  if (scraped.articleMeta.publishedTime) return "Article";

  if (PRICE_RE.test(scraped.bodyText)) return "Product";

  if (project.isLocalBusiness && project.businessName) return "LocalBusiness";

  return "WebPage";
}

// Validador genérico -----------------------------------------------------------

function isEmptyValue(v: unknown): boolean {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

const DATE_PROPS = new Set([
  "datePublished",
  "dateModified",
  "startDate",
  "endDate",
  "uploadDate",
  "datePosted",
  "lastReviewed",
]);

function validateProp(prop: SchemaProp, value: unknown, path: string, errors: string[]): void {
  if (prop.level === "required" && isEmptyValue(value)) {
    errors.push(`Falta "${path}"`);
    return;
  }
  if (value === undefined || value === null || value === "") return;

  if (prop.maxLength && typeof value === "string" && value.length > prop.maxLength) {
    errors.push(`"${path}" supera los ${prop.maxLength} caracteres recomendados`);
  }
  if (DATE_PROPS.has(prop.name) && typeof value === "string" && Number.isNaN(Date.parse(value))) {
    errors.push(`"${path}" no es una fecha ISO válida`);
  }

  if (prop.nestedType) {
    const arr = prop.multiple ? (Array.isArray(value) ? value : []) : [value];
    arr.forEach((item, i) => {
      if (typeof item !== "object" || item === null) {
        if (prop.level === "required") errors.push(`"${path}" debe ser un objeto`);
        return;
      }
      const obj = item as Record<string, unknown>;
      const where = prop.multiple ? `${path}[${i + 1}]` : path;
      if (obj["@type"] !== prop.nestedType) {
        errors.push(`"${where}": falta "@type": "${prop.nestedType}"`);
      }
      if (prop.nested) {
        for (const child of prop.nested) {
          validateProp(child, obj[child.name], `${where}.${child.name}`, errors);
        }
      }
    });
  }
}

export function validateJsonLd(
  type: string,
  jsonLd: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (jsonLd["@context"] !== "https://schema.org") {
    errors.push('Falta "@context": "https://schema.org"');
  }
  if (jsonLd["@type"] !== type) {
    errors.push(`"@type" debe ser "${type}"`);
  }
  const entry = getCatalogEntry(type);
  if (entry) {
    for (const prop of entry.properties) {
      validateProp(prop, jsonLd[prop.name], prop.name, errors);
    }
  }
  return { valid: errors.length === 0, errors };
}
