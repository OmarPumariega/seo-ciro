// Fuente única de verdad para el texto de cada tipo de incidencia de
// auditoría — la usan tanto el servidor (generación de Tareas en job.ts)
// como el cliente (listado de incidencias en AuditoriaView). Vive en un
// módulo sin dependencias de servidor (sin prisma) para poder importarse
// desde un componente "use client" sin arrastrar código de servidor al bundle.

export type IssueMeta = {
  label: string;
  description: string;
  // null = incidencia informativa (noindex, sin impresiones GSC): se
  // muestra pero no se ofrece "cómo arreglar" ni cuenta como accionable
  // (tampoco genera Tarea automática, ver src/lib/audit/job.ts).
  fix: string | null;
  // Frase mostrada en "Reglas aprobadas" cuando 0 páginas tienen esta incidencia.
  passText: string;
  tab: "tecnica" | "onpage";
};

export const ISSUE_META: Record<string, IssueMeta> = {
  missing_canonical: {
    label: "Sin etiqueta canonical",
    description: "No se encontró etiqueta canonical en el <head>.",
    fix: "Añade <link rel='canonical' href='URL_CANÓNICA'> en el <head> para evitar contenido duplicado.",
    passText: "Todas las páginas rastreadas tienen una etiqueta canonical.",
    tab: "tecnica",
  },
  noindex: {
    label: "Marcada noindex",
    description: "La página está marcada explícitamente como noindex.",
    fix: null,
    passText: "Ninguna página está marcada como noindex.",
    tab: "tecnica",
  },
  no_https: {
    label: "Sin HTTPS",
    description: "La página se sirve sin cifrado HTTPS.",
    fix: "Instala un certificado SSL y configura redirecciones 301 de HTTP a HTTPS en todo el sitio.",
    passText: "Todo el sitio se sirve por HTTPS.",
    tab: "tecnica",
  },
  redirect: {
    label: "Redirección (3xx)",
    description: "La página devuelve una redirección en vez de responder directamente.",
    fix: "Si es una redirección 301 permanente, actualiza los enlaces internos para apuntar directamente a la URL final.",
    passText: "No se detectaron páginas con redirección durante el rastreo.",
    tab: "tecnica",
  },
  broken_links: {
    label: "Enlaces rotos",
    description: "La página enlaza a una o más URLs internas que devuelven error.",
    fix: "Revisa cada enlace roto: actualiza la URL, añade una redirección 301, o elimina el enlace si ya no existe.",
    passText: "No se encontraron enlaces internos rotos.",
    tab: "tecnica",
  },
  no_gsc_impressions: {
    label: "Sin impresiones GSC (90 días)",
    description: "Sin impresiones en Search Console en los últimos 90 días.",
    fix: null,
    passText: "Todas las páginas rastreadas han recibido impresiones en Search Console en los últimos 90 días.",
    tab: "tecnica",
  },
  missing_alt: {
    label: "Imágenes sin alt",
    description: "Una o más imágenes de la página no tienen atributo alt.",
    fix: "Añade atributos alt descriptivos a las imágenes (describen la imagen para accesibilidad y SEO de imágenes).",
    passText: "Todas las imágenes rastreadas tienen texto alternativo.",
    tab: "onpage",
  },
  thin_content: {
    label: "Thin content (<300 palabras)",
    description: "La página tiene menos de 300 palabras de contenido.",
    fix: "Amplía el contenido a mínimo 300 palabras con información útil, única y relevante para el usuario.",
    passText: "Ninguna página tiene menos de 300 palabras.",
    tab: "onpage",
  },
  missing_title: {
    label: "Sin título",
    description: "La página no tiene etiqueta <title>.",
    fix: "Añade un <title> único de 50-60 caracteres en el <head> de cada página.",
    passText: "Todas las páginas tienen etiqueta <title>.",
    tab: "onpage",
  },
  title_long: {
    label: "Título largo (>65)",
    description: "El título supera los 65 caracteres; Google puede truncarlo en resultados.",
    fix: "Acorta el título a máximo 65 caracteres.",
    passText: "Ningún título supera los 65 caracteres.",
    tab: "onpage",
  },
  title_short: {
    label: "Título corto (<30)",
    description: "El título tiene menos de 30 caracteres.",
    fix: "Amplía el título a mínimo 30 caracteres para mejorar el CTR en los resultados.",
    passText: "Ningún título tiene menos de 30 caracteres.",
    tab: "onpage",
  },
  duplicate_title: {
    label: "Título duplicado",
    description: "El título coincide exactamente con el de otra página del sitio.",
    fix: "Cada página debe tener un título único. Personaliza los títulos para evitar canibalización.",
    passText: "No hay títulos duplicados entre páginas.",
    tab: "onpage",
  },
  missing_meta: {
    label: "Sin meta description",
    description: "La página no tiene meta description.",
    fix: "Añade una meta description de 120-160 caracteres que describa el contenido de la página.",
    passText: "Todas las páginas tienen meta description.",
    tab: "onpage",
  },
  meta_long: {
    label: "Meta larga (>160)",
    description: "La meta description supera los 160 caracteres.",
    fix: "Acorta la meta description a máximo 160 caracteres para que Google no la corte.",
    passText: "Ninguna meta description supera los 160 caracteres.",
    tab: "onpage",
  },
  meta_short: {
    label: "Meta corta (<120)",
    description: "La meta description tiene menos de 120 caracteres.",
    fix: "Amplía la meta description a mínimo 120 caracteres para mejor CTR.",
    passText: "Ninguna meta description tiene menos de 120 caracteres.",
    tab: "onpage",
  },
  duplicate_meta: {
    label: "Meta description duplicada",
    description: "La meta description coincide exactamente con la de otra página del sitio.",
    fix: "Cada meta description debe ser única. Personaliza cada una según el contenido de su página.",
    passText: "No hay meta descriptions duplicadas entre páginas.",
    tab: "onpage",
  },
  missing_h1: {
    label: "Sin H1",
    description: "La página no tiene ningún encabezado H1.",
    fix: "Añade un único encabezado H1 que describa el tema principal de la página.",
    passText: "Todas las páginas tienen un H1.",
    tab: "onpage",
  },
  multiple_h1: {
    label: "Múltiples H1",
    description: "La página tiene más de un encabezado H1.",
    fix: "Deja solo un H1 por página. Convierte los demás en H2 o H3.",
    passText: "Ninguna página tiene más de un H1.",
    tab: "onpage",
  },
};

export const TECNICA_ISSUES = Object.entries(ISSUE_META)
  .filter(([, m]) => m.tab === "tecnica")
  .map(([k]) => k);

export const ONPAGE_ISSUES = Object.entries(ISSUE_META)
  .filter(([, m]) => m.tab === "onpage")
  .map(([k]) => k);
