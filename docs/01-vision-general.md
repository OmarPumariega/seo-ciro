# 01 — Visión general

SEO Ciro sustituye herramientas SEO de terceros (Ahrefs, Semrush, LocalFalcon...) por
un sistema propio de Agencia Ciro conectado a APIs reales. Cada cliente/dominio es un
**proyecto** con su propio perfil, datos e historial. Ver [`spec-original.md`](./spec-original.md)
para la especificación funcional completa de los 9 módulos.

## Estado actual (esqueleto inicial)

Esta primera fase construye únicamente la base sobre la que colgará el resto:

- ✅ Auth de agencia (login único, preparado para multi-usuario)
- ✅ Módulo 2 (Gestión de Proyecto) — CRUD básico: perfil, NAP, tono de marca
- 🟡 Módulo 1 — Keyword Research: volumen/intención/prioridad reales vía DataForSEO
  (Keywords Data + Labs Search Intent) + generación de estructura de URLs. Solo
  DataForSEO como fuente por ahora; Google Ads queda pendiente (requiere developer
  token aprobado). Sin expansión de keywords semilla todavía.
- ✅ Módulo 3 — Título y Meta Descripción (vía OpenRouter, reglas en `docs/seo-rules.md`)
- ✅ Módulo 4 — Schema (LocalBusiness determinista + Article/FAQPage vía OpenRouter)
- ✅ Módulo 5 — Rank Tracking: seguimiento de posiciones orgánicas (top-100)
  vía DataForSEO SERP API. "Comprobar ahora" síncrono + frecuencias
  programadas (diaria/semanal/mensual) vía el cron interno. Solo orgánico
  (Geogrid → Módulo 9), sin competidores en esta fase.
- 🟡 Módulo 6 — Integraciones Google: Search Console + GA4 vía OAuth2 único de la
  agencia; Business Profile pendiente de aprobación de acceso de Google
- ✅ Módulo 7 — Generador de Contenido (Blog/Página/Producto/Novedad GBP vía OpenRouter,
  reutiliza el tono de marca del proyecto)
- 🟡 Módulo 8 — Auditoría Técnica: crawler propio + PageSpeed Insights (solo home) +
  cruce de impresiones con Search Console; falta la programación automática mensual
  (solo disparo manual esta sesión)
- ✅ Módulo 9 — Geogrid Local SEO: mapa de calor del posicionamiento en Google
  Maps (rejilla 3×3/5×5/7×7 + radio) vía DataForSEO Maps SERP con coordenadas
  exactas por punto. Asíncrono vía cron (rejilla 5×5 = 25 llamadas ~75s).
  Solo para proyectos marcados como negocio local con coordenadas definidas.
- ✅ Cola de tareas — **no** BullMQ/Redis: cron interno vía `src/instrumentation.ts` +
  `instrumentation-node.ts` (mismo patrón que Cirochat), sondea `AuditRun` cada 60s.
  El Módulo 9 debe reutilizar este mismo poller, no montar Redis
- 🟡 Control de costes de API — log por llamada (`ApiUsageLog`) + **tope de gasto mensual
  global de DataForSEO** (`DATAFORSEO_MONTHLY_LIMIT_USD`, bloquea nuevas llamadas al
  superarlo, la UI avisa); faltan topes por proyecto y avisos por email
- ✅ Caché de resultados — `KeywordDataCache` (Módulo 1), 30 días de frescura por
  (keyword, idioma, ubicación), compartida entre proyectos

Cada uno de estos módulos se planifica y construye en una sesión dedicada, siguiendo
el orden recomendado en la sección 8 de `spec-original.md`.
