# 01 — Visión general

SEO Ciro sustituye herramientas SEO de terceros (Ahrefs, Semrush, LocalFalcon...) por
un sistema propio de Agencia Ciro conectado a APIs reales. Cada cliente/dominio es un
**proyecto** con su propio perfil, datos e historial. Ver [`spec-original.md`](./spec-original.md)
para la especificación funcional completa de los 9 módulos.

## Estado actual (esqueleto inicial)

Esta primera fase construye únicamente la base sobre la que colgará el resto:

- ✅ Auth de agencia (login único, preparado para multi-usuario)
- ✅ Módulo 2 (Gestión de Proyecto) — CRUD: perfil, NAP, tono de marca,
  coordenadas + **lista de To-do por proyecto** (tareas manuales con fecha)
- 🟡 Módulo 1 — Keyword Research: volumen/intención/prioridad reales vía DataForSEO
  (Keywords Data + Labs Search Intent) + generación de estructura de URLs. Solo
  DataForSEO como fuente por ahora; Google Ads queda pendiente (requiere developer
  token aprobado). Sin expansión de keywords semilla todavía.
- ✅ Módulo 3 — Título y Meta Descripción (vía OpenRouter, reglas en `docs/seo-rules.md`)
- ✅ Módulo 4 — Schema (catálogo data-driven de ~20 tipos de schema.org; 4 deterministas + resto vía un prompt LLM genérico parametrizado por las props del tipo)
- ✅ Módulo 5 — Rank Tracking: seguimiento de posiciones orgánicas (top-100)
  vía DataForSEO SERP API. "Comprobar ahora" síncrono + frecuencias
  programadas (diaria/semanal/mensual) vía el cron interno. Solo orgánico
  (Geogrid → Módulo 9), sin competidores en esta fase.
- 🟡 Módulo 6 — Integraciones Google: Search Console + GA4 vía OAuth2 único de la
  agencia; Business Profile pendiente de aprobación de acceso de Google
- ✅ Módulo 7 — Generador de Contenido (Blog/Página/Producto/Novedad GBP vía OpenRouter,
  reutiliza el tono de marca del proyecto)
- ✅ Módulo 8 — Auditoría Técnica: crawler propio + PageSpeed Insights (solo home) +
  cruce de impresiones con Search Console + **programación automática mensual**
  (el cron crea una AuditRun pending cuando toca, sin disparo manual)
- ✅ Módulo 9 — Geogrid Local SEO: mapa de calor del posicionamiento en Google
  Maps (rejilla 3×3/5×5/7×7 + radio) vía DataForSEO Maps SERP con coordenadas
  exactas por punto. Asíncrono vía cron (rejilla 5×5 = 25 llamadas ~75s).
  Solo para proyectos marcados como negocio local con coordenadas definidas.
- ✅ Cola de tareas — **no** BullMQ/Redis: cron interno vía `src/instrumentation.ts` +
  `instrumentation-node.ts` (mismo patrón que Cirochat), sondea `AuditRun` cada 60s.
  El Módulo 9 debe reutilizar este mismo poller, no montar Redis
- ✅ Control de costes de API — log por llamada (`ApiUsageLog`) + **tope de gasto
  mensual global** y **por proyecto** (bloquean nuevas llamadas al superarlo, la
  UI avisa) + avisos por email + página `/admin/costes` con desglose y estimación
  pre-confirmación en todas las herramientas que gastan
- ✅ Caché de resultados — `KeywordDataCache` (Módulo 1), 30 días de frescura por
  (keyword, idioma, ubicación), compartida entre proyectos
- ✅ Informe imprimible/compartible por proyecto (vista con CSS de impresión →
  "Guardar como PDF") que agrega auditoría, rank tracking, keywords, geogrid y costes
- ✅ Avisos por email (SMTP vía nodemailer, opcionales) — auditoría completada/fallida,
  caída de posición ≥10, tope de DataForSEO cercano/superado. Dedupe por evento (sin
  spam) en `NotificationLog`; degradación elegante si no hay SMTP configurado
- ✅ Versionado de contenido (Módulo 7) — agrupación por tema, comparar versiones con
  diff línea a línea (LCS), restaurar y regenerar
- ✅ TF-IDF / prominencia semántica — top-10 de Google para una keyword, scraping y
  términos recomendados para el contenido (sin coste de API, solo scraping)
- ✅ PageRank interno + enlazado interno — calculado sobre el grafo de enlaces del crawl
  del Módulo 8 (persistido en `AuditRun.linkGraph`)
- ✅ Thin content — conteo de palabras por página en el crawl del Módulo 8
- ✅ Canibalizaciones — mismas keywords posicionando varias URLs (vía Search Console)
- ✅ Copilot SEO — chat con IA que entiende los datos del proyecto (`CopilotThread`)

- ✅ Competidores (Tier 2) — espionaje vía DataForSEO Labs: visibilidad de
  cualquier dominio (tráfico orgánico estimado + nº keywords + **distribución de
  fuerza del dominio** top3/10/100 + top keywords con CPC/dificultad/estacionalidad),
  histórico de snapshots para **tendencia por competidor**, y content gap (keywords
  que ranquea un competidor y el proyecto no, vía domain_intersection) como **tabla
  rica** con snippet + URL del competidor por keyword. Botones para importar el
  gap/top a un estudio (Módulo 1) o a Rank Tracking.

## Roadmap pendiente (futuro, no olvidar)

Funcionalidades de la competencia aún NO construidas:

- **Tier 3 — bloqueadas por coste/terceros**:
  - SEO para LLMs (menciones en ChatGPT/Gemini/Claude) — DataForSEO LLM Mentions,
    compromiso mínimo 100$/mes.
  - Link Building / Link Craft (backlinks) — API de Backlinks de DataForSEO aparte.
  - Google Ads como fuente alternativa de volumen (Módulo 1) — developer token aprobado.
  - Business Profile API (Módulo 6) — pendiente de aprobación de Google.

Cada uno de estos módulos se planifica y construye en una sesión dedicada, siguiendo
el orden recomendado en la sección 8 de `spec-original.md`.
