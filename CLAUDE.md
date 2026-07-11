# CLAUDE.md — SEO Ciro

## Rol y objetivo

Ingeniero full stack construyendo **SEO Ciro**, una herramienta interna de Agencia Ciro
(Sentido Común Internet SL) para centralizar el trabajo SEO diario de la agencia,
sustituyendo herramientas de terceros (Ahrefs, Semrush, LocalFalcon...) por un sistema
propio conectado a APIs reales.

**Principio no negociable (heredado del spec):** todos los datos mostrados deben venir
de fuentes reales y verificables. Nada se inventa ni se estima sin fuente.

Especificación funcional completa de los 9 módulos: [`docs/spec-original.md`](./docs/spec-original.md).
Estado de qué está construido: [`docs/01-vision-general.md`](./docs/01-vision-general.md).

## Lo que estamos construyendo

Un panel interno de un solo inquilino (la agencia, no multi-tenant como Cirochat) donde
cada cliente/dominio es un **proyecto**. Alrededor de cada proyecto cuelgan, módulo a
módulo: keyword research, títulos/metas, schema, rank tracking, integraciones Google,
generación de contenido, auditoría técnica y geogrid local SEO.

Cada módulo se planifica y construye en su propia sesión — no se adelanta
infraestructura (colas, caché, tablas de coste) para módulos que todavía no existen.

## Stack tecnológico

- **Next.js 16** (App Router) + TypeScript + Tailwind 4 — mismo stack que el proyecto
  hermano Cirochat (`../Cirochat/cirochat-app`), reutiliza patrones ya validados en
  producción (auth, cifrado, Docker/Traefik/Coolify)
- **PostgreSQL + Prisma** (adapter `PrismaPg`) — sin pgvector, esta app no usa embeddings
- **NextAuth (JWT)** — credentials + bcrypt, un único usuario por ahora, con `role`
  preparado para multi-usuario futuro
- **Cifrado AES-256-CBC** (`src/lib/crypto.ts`) — usado por el Módulo 6 para el refresh
  token de Google
- **OpenRouter** (`src/lib/seo/llm.ts`) — SDK `openai` apuntando a `https://openrouter.ai/api/v1`,
  usado por los Módulos 3, 4 y 1 (estructura de URLs), además del 7. Modelo configurable
  por `OPENROUTER_MODEL`, no hardcodeado — permite cambiar de proveedor (Claude, GPT,
  Gemini...) sin tocar código
- **cheerio** (`src/lib/seo/scrape.ts`) — scraping de URLs reales para Módulo 3 y 4
- **DataForSEO** (`src/lib/keywords/dataforseo.ts`) — Módulo 1: auth HTTP Basic
  (`DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD`), dos endpoints — Keywords Data API para
  volumen/competición/CPC y DataForSEO Labs Search Intent para intención de búsqueda.
  Resultados cacheados en `KeywordDataCache` 30 días (compartidos entre proyectos: el
  volumen es un dato objetivo de SERP); cada llamada real se registra en `ApiUsageLog`.
- **DataForSEO SERP** (`src/lib/rank/serp.ts`) — Módulo 5: SERP orgánico de Google
  (`serp/google/organic/live/advanced`, depth configurable 10/30/50/100, default 10) para
  localizar la posición del dominio del proyecto. El cliente HTTP Basic compartido vive en
  `src/lib/dataforseo/`.
- **DataForSEO Maps SERP** (`src/lib/geogrid/maps.ts`) — Módulo 9: Maps SERP
  (`serp/google/maps/live/advanced`) con coordenadas exactas por punto (`location_coordinate`
  "lat,lng,zoom"), para el mapa de calor de posicionamiento local. Reutiliza el cliente y el
  matching de dominio del Módulo 5.
- **googleapis** (`src/lib/google/`) — OAuth2 + Search Console + GA4 (Admin y Data API)
  para el Módulo 6, un único paquete cubre las tres. Business Profile queda fuera hasta
  que Google apruebe el acceso a su API.
- **Cron interno sin Redis** (`src/instrumentation.ts` + `instrumentation-node.ts`,
  Módulos 8, 5 y 9) — cada 60s procesa: una `AuditRun` pending (Módulo 8), las keywords
  de rank tracking cuya frecuencia se ha vencido (Módulo 5) y un geogrid pending
  (Módulo 9). Mismo patrón que Cirochat pero corregido (ver `docs/02-arquitectura.md`
  para el gotcha de por qué el patrón de Cirochat probablemente nunca se ejecuta).
  **Solo corre con `NODE_ENV=production`** — en `npm run dev` nunca se dispara, hace
  falta `npm run build && npm run start`.
- **robots-parser** + fetch/cheerio propios (`src/lib/audit/`) — crawler del Módulo 8,
  identificado como `SEOCiroBot/1.0`, no como un navegador (a diferencia del scraper de
  Módulo 3/4). `PAGESPEED_API_KEY` (Google Cloud, sin OAuth) solo se consulta sobre la
  home del proyecto, nunca por página rastreada.
- **Infraestructura:** VPS Contabo existente, Docker, Coolify, Traefik

Fuera del esqueleto actual, previstos para cuando el módulo correspondiente lo necesite:
Google Ads API (fuente alternativa de volumen para el Módulo 1), Business Profile API.

## Esquema de base de datos (Prisma)

Ver [`docs/04-modelo-de-datos.md`](./docs/04-modelo-de-datos.md) para el detalle y la
evolución prevista por módulo. Hoy: `User` (login agencia), `Project` (cliente/dominio,
con NAP, perfil de marca y propiedad de Google seleccionada), `TitleMetaGeneration` y
`SchemaGeneration` (historial de los Módulos 3 y 4 por proyecto), `ApiUsageLog`
(registro básico de coste por llamada a OpenRouter), `GoogleConnection` (conexión OAuth2
única de la agencia con Google, Módulo 6), `ContentGeneration` (Módulo 7), `AuditRun` +
`AuditPage` (Módulo 8, primer módulo con datos anidados N-por-ejecución).

## Estructura de carpetas

Ver [`docs/02-arquitectura.md`](./docs/02-arquitectura.md).

## Panel de administración — secciones

### Panel general (`/admin`)
Placeholder con contador de proyectos. Crecerá con alertas cruzadas (auditoría
pendiente, keywords bajando, tareas vencidas) cuando existan esos módulos.

### Proyectos (`/admin/proyectos`) — Módulo 2
Listar, crear y editar proyectos: nombre, dominio, NAP (si es negocio local, con
lat/lng para geogrid) y perfil de marca (tono de voz, notas). To-do list y
protocolos del spec todavía no están construidos.

### Costes (`/admin/costes`)
Panel de consumo de API del mes en curso (sección 5 del spec): gasto de DataForSEO
vs tope mensual configurado, total de todas las APIs (DataForSEO + OpenRouter) y
desglose por tipo de llamada y por proyecto. Además, **toda acción que gasta
muestra una estimación de coste antes de confirmar** (estilo WebCEO): el rank
tracking calcula el coste mensual según nº de keywords × depth × frecuencia (vive
al mover los selectores); el geogrid estima por rejilla; los estudios de keywords
muestran la tarifa plana. La estimación es orientativa — el coste real es el que
devuelve la API y se registra en `ApiUsageLog`.

### Configuración (`/admin/configuracion`)
Único ítem realmente global (no de proyecto) del sidebar aparte de Panel general y
Proyectos: conexión OAuth2 de la agencia con Google (Módulo 6). Conectar/desconectar,
ver email y scopes concedidos. La *selección de propiedad* por proyecto vive en la
ficha de cada proyecto, no aquí — la conexión es una, las propiedades son por proyecto.

### Ficha de proyecto (`/admin/proyectos/[id]/...`) — pestañas Perfil / Keywords / Título y Meta / Schema / Rank Tracking / Google / Contenido / Auditoría / Geogrid
Todos los módulos salvo el 2 son inherentemente "de un proyecto", así que en vez de
añadir ítems al sidebar global se anidan como pestañas dentro de la ficha del proyecto
(`src/components/admin/ProjectSubNav.tsx`). El orden de pestañas sigue el número de
módulo ascendente. La pestaña **Geogrid solo aparece si el proyecto es negocio local**
con coordenadas definidas.

- **Keywords** (Módulo 1): textarea con lista de keywords → resolución de
  volumen/competición/CPC (DataForSEO Keywords Data) + intención (DataForSEO Labs Search
  Intent), cacheada en `KeywordDataCache` 30 días y compartida entre proyectos →
  priorización por volumen → tabla de resultados → "Generar estructura de URLs" (vía
  OpenRouter sobre las keywords ya persistidas, agrupando por intención). Solo
  DataForSEO como fuente por ahora (Google Ads, fuente alternativa, queda pendiente).
- **Título y Meta** (Módulo 3): URL → scraping real → 3 variantes de título/meta
  descripción vía OpenRouter, siguiendo [`docs/seo-rules.md`](./docs/seo-rules.md).
  Keyword objetivo manual opcional (puede venir del Módulo 1 cuando exista estudio).
- **Schema** (Módulo 4): URL → analizar (heurística, sin LLM) → confirmar/cambiar tipo
  (LocalBusiness / Article / FAQPage) → generar JSON-LD. `LocalBusiness` es determinista
  (mapeo directo del NAP del proyecto, sin coste de LLM); `Article`/`FAQPage` usan
  OpenRouter y quedan registrados en `ApiUsageLog`.
- **Rank Tracking** (Módulo 5): keywords seguidas por proyecto (desacopladas de los
  estudios) → "comprobar ahora" síncrono vía DataForSEO SERP (top-100) o frecuencias
  programadas (diaria/semanal/mensual) que procesa el cron. Posición actual con flecha
  de tendencia, mejor histórica y sparkline de evolución. Importa keywords desde un
  estudio del Módulo 1. Solo orgánico (Geogrid → Módulo 9).
- **Google** (Módulo 6): si no hay conexión de agencia, enlaza a Configuración. Si la
  hay, selectores de propiedad de Search Console y GA4 (Business Profile deshabilitado,
  pendiente de aprobación de Google) + dashboard de últimos 28 días (clics/impresiones
  de GSC, sesiones/conversiones de GA4). Cada fuente se degrada de forma independiente
  si falla — un token revocado o una propiedad borrada no tumba la otra fuente.
- **Contenido** (Módulo 7): tema + tipo (Blog/Página/Producto/Novedad GBP) + longitud
  objetivo → texto vía OpenRouter con encabezados en Markdown, usando el tono de marca
  del proyecto (`Project.toneOfVoice`). Keyword objetivo y enlaces internos a incluir
  son manuales (hasta que exista el Módulo 1) — si no se aportan, nunca se inventan.
- **Auditoría** (Módulo 8): botón "Ejecutar auditoría ahora" → crea `AuditRun` pending
  → el cron interno la procesa en segundo plano (hasta 60s de latencia) → rastreo del
  sitio (enlaces rotos, HTTPS, canonicals, meta robots, sitemap.xml, alts de imagen),
  PageSpeed Insights de la home, y cruce de impresiones con Search Console si el
  proyecto tiene GSC conectado. Puntuación 0-100 explicable por categorías (nunca caja
  negra). Solo disparo manual esta sesión — la programación automática mensual queda
  pendiente.
- **Geogrid** (Módulo 9, solo negocios locales): keyword + rejilla (3×3/5×5/7×7) + radio
  → crea `GeogridRun` pending → el cron consulta Maps SERP en cada punto con coordenada
  exacta y localiza la posición del negocio (match por dominio o nombre) → mapa de calor
  verde/amarillo/rojo. Asíncrono (polling como la auditoría). Tope de gasto aplicado al
  inicio de cada run.

## Seguridad

- Contraseñas con `bcryptjs`, nunca en texto plano
- Rate limiting de login por IP y por email (`src/lib/rate-limit.ts`)
- Cabeceras de seguridad y CSP en `next.config.ts`
- Secrets futuros cifrados con AES-256-CBC antes de tocar BD — nunca en texto plano
- OAuth de Google (Módulo 6): protección CSRF con cookie `google_oauth_state`
  (httpOnly, sameSite=lax, 10 min) comparada contra el parámetro `state` que Google
  devuelve — suficiente para una herramienta interna de un solo admin, sin tabla de
  estados. La cookie de sesión de NextAuth viaja intacta durante toda la redirección
  (SameSite=Lax permite cookies en navegación de nivel superior), así que
  `/api/google/oauth/callback` puede volver a comprobar `getServerSession` con normalidad

## Variables de entorno necesarias

Ver [`.env.example`](./.env.example).

## Git y control de versiones

- Commits en español, describiendo el porqué del cambio
- No hacer commit de `.env` (real) — solo `.env.example`
- Un módulo del spec = una sesión de planificación + implementación, no se mezclan

## Consideraciones de despliegue (VPS Contabo)

Mismo patrón que Cirochat: `Dockerfile` multi-stage + `docker-compose.yml` con Traefik
(Coolify) para SSL automático. Dominio actual en `docker-compose.yml` es un
**placeholder** (`seo.agenciaciro.com`) — ajustar al subdominio real antes de desplegar.

## Esqueleto inicial — qué falta

Ver la lista de módulos pendientes en [`docs/01-vision-general.md`](./docs/01-vision-general.md).
Construir en el orden recomendado por la sección 8 de `docs/spec-original.md`.
