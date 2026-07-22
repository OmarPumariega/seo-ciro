# CLAUDE.md — SEO Ciro

## Rol y objetivo

Ingeniero full stack construyendo **SEO Ciro**, una herramienta interna de Agencia Ciro
para centralizar el trabajo SEO diario de la agencia,
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
generación de contenido, auditoría técnica y geogrid local SEO — los 9 módulos del
spec están completos.

Sobre esa base, y siguiendo el mismo principio de "solo datos reales" pero fuera del
alcance original de 9 módulos, se añadió un conjunto de funcionalidad orientada a
igualar herramientas de la competencia (Dinorank y similares): TF-IDF, PageRank
interno, detección de contenido fino y de canibalizaciones, un Copilot de IA de solo
lectura, un módulo de Competidores (visibilidad + content gap), control de gasto con
tope por proyecto, avisos por email y generación automática de tareas desde hallazgos
de auditoría. Ver [`docs/01-vision-general.md`](./docs/01-vision-general.md) para el
estado exacto de cada pieza.

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
  usado por los Módulos 3, 4 y 1 (estructura de URLs), además del 7 y el **Copilot**
  (`src/lib/copilot/`, chat de solo lectura con contexto del proyecto inyectado como
  texto plano). Modelo configurable por `OPENROUTER_MODEL`
  (default `openai/gpt-4o-mini`), no hardcodeado — permite cambiar de proveedor
  (Claude, GPT, Gemini...) sin tocar código
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
  Módulos 8, 5 y 9) — cada 60s ejecuta en secuencia `runAuditJob` (una `AuditRun`
  pending), `runRankJob` (el proyecto con keywords de rank tracking más vencidas,
  hasta 50 por tick) y `runGeogridJob` (un `GeogridRun` pending). Mismo patrón que
  Cirochat pero corregido (ver `docs/02-arquitectura.md` para el gotcha de por qué el
  patrón de Cirochat probablemente nunca se ejecuta). **Solo corre con
  `NODE_ENV=production`** — en `npm run dev` nunca se dispara, hace falta
  `npm run build && npm run start`. Para no depender de esperar al siguiente tick en
  dev, las rutas POST de auditoría y geogrid además disparan el procesamiento
  inmediatamente vía import dinámico fire-and-forget al crear el run.
- **robots-parser** + fetch/cheerio propios (`src/lib/audit/`) — crawler del Módulo 8,
  identificado como `SEOCiroBot/1.0`, no como un navegador (a diferencia del scraper de
  Módulo 3/4). `PAGESPEED_API_KEY` (Google Cloud, sin OAuth) solo se consulta sobre la
  home del proyecto, nunca por página rastreada. El crawl también persiste el grafo de
  enlaces (`AuditRun.linkGraph`), que reutiliza el módulo de PageRank interno.
- **nodemailer** (`src/lib/notifications/`) — avisos por email opcionales (SMTP), sin
  proveedor gestionado. Dedupe por evento en `NotificationLog`; si no hay
  `SMTP_HOST`/`ALERT_TO` configurados, se omite el envío sin error visible.
- **Infraestructura:** VPS Contabo existente, Docker, Coolify, Traefik

Fuera del alcance actual, previstos para cuando el módulo correspondiente lo necesite:
Google Ads API (fuente alternativa de volumen para el Módulo 1), Business Profile API,
SEO para LLMs (menciones en ChatGPT/Gemini) y Link Building — ambos bloqueados por
coste mínimo de terceros, ver `docs/01-vision-general.md`.

## Esquema de base de datos (Prisma)

Ver [`docs/04-modelo-de-datos.md`](./docs/04-modelo-de-datos.md) para el detalle
completo (23 modelos). Resumen: `User` (login agencia), `Project` (cliente/dominio, con
NAP, perfil de marca, propiedad de Google seleccionada y tope de gasto opcional),
`TitleMetaGeneration` y `SchemaGeneration` (historial de los Módulos 3 y 4),
`ApiUsageLog` (coste por llamada a OpenRouter/DataForSEO, base del control de gasto),
`GoogleConnection` (OAuth2 único de la agencia, Módulo 6), `ContentGeneration` (Módulo 7,
con versionado por tema), `AuditRun` + `AuditPage` (Módulo 8, ampliado con checks
on-page/robots/sitemap), `KeywordStudy` + `Keyword` + `KeywordDataCache` (Módulo 1),
`RankKeyword` + `RankPosition` (Módulo 5), `GeogridRun` (Módulo 9), `TodoItem` (manual
+ auto-generado desde auditoría), `NotificationLog` (dedupe de avisos por email),
`CopilotThread`, `SerpCache` (compartida entre Rank Tracking y TF-IDF), `Competitor` +
`VisibilitySnapshot` (módulo Competidores), `AppSetting` (secrets cifrados,
cascada BD→.env) y `GlobalSetting` (config JSON no sensible — p.ej. el default del
informe para todos los proyectos).

## Estructura de carpetas

Ver [`docs/02-arquitectura.md`](./docs/02-arquitectura.md).

## Panel de administración — secciones

La navegación **ya no usa pestañas horizontales dentro de la ficha de proyecto**
(el antiguo `ProjectSubNav.tsx` no existe). Todo el nav vive en el sidebar global
(`src/components/admin/AdminSidebar.tsx`): Panel general / Proyectos / Costes /
Configuración siempre visibles, y —cuando la ruta es de un proyecto— un
`ProjectSwitcher.tsx` (buscador + últimos 5 recientes) seguido de la lista vertical
fija de módulos del proyecto. Ver `docs/02-arquitectura.md` → "Navegación" para el
detalle completo.

### Panel general (`/admin`)
Dashboard real (no placeholder): KPIs agregados, avisos cruzados (auditorías con
problemas, caídas de posición, gasto cerca del tope) y una tabla de salud por
proyecto.

### Proyectos (`/admin/proyectos`) — Módulo 2
Listar, crear y editar proyectos: nombre, dominio, NAP (si es negocio local, con
lat/lng para geogrid), perfil de marca (tono de voz, notas) y tope de gasto mensual
opcional. La lista de To-do vive en la pestaña **Tareas** de cada proyecto, no aquí.

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
Proyectos. Tres bloques:

- **Claves de API** (`src/lib/settings.ts`, modelo `AppSetting`): las claves de
  DataForSEO, OpenRouter, PageSpeed Insights, **Google OAuth (Client ID/Secret/
  Redirect URI)** y SMTP/avisos por email se pueden guardar aquí en vez de (o
  además de) el `.env` — cifradas en reposo con el mismo AES-256-CBC de
  `src/lib/crypto.ts`. `getSetting(key)` resuelve en cascada: fila en `AppSetting`
  (si se guardó desde la UI) → variable de entorno del mismo nombre → sin
  configurar. El valor real nunca vuelve al cliente una vez guardado — la UI solo
  sabe si está "configurado" y desde dónde (BD o `.env`); cambiarlo no requiere
  tocar el servidor ni reiniciar nada (caché en memoria de 30s, invalidada al
  guardar). `DATABASE_URL`, `NEXTAUTH_SECRET` y `ENCRYPTION_KEY` quedan fuera a
  propósito — son necesarias para arrancar la app o abrir la propia base de
  datos, no pueden vivir dentro de ella.
- **Informe — configuración por defecto** (`src/components/admin/InformeGlobalConfigCard.tsx`,
  modelo `GlobalSetting`): define qué secciones del informe (tasks, audit, rank,
  keywords, …) están activadas y en qué orden para TODOS los proyectos por defecto.
  Persiste en `GlobalSetting["INFORME_DEFAULT_CONFIG"]` como JSON sin cifrar (no es
  sensible). La cascada de resolución al abrir el informe de un proyecto es:
  `Project.reportConfig` (override explícito del proyecto) → `GlobalSetting.INFORME_DEFAULT_CONFIG`
  (global) → `DEFAULT_SECTIONS`/`DEFAULT_ORDER` hardcoded en `src/lib/informe/sections.ts`.
  Cada proyecto puede tener su propio override desde su InformeBuilder; el botón
  "Restablecer al default global" borra ese override (`DELETE /api/proyectos/[id]/informe/config`).
- **Conexión con Google** (Módulo 6): OAuth2 de la agencia. Conectar/desconectar, ver
  email y scopes concedidos. La *selección de propiedad* por proyecto vive en la
  ficha de cada proyecto, no aquí — la conexión es una, las propiedades son por
  proyecto.

### Ficha de proyecto (`/admin/proyectos/[id]/...`)
Módulos anidados por ruta, con el nav en el sidebar global (no pestañas locales), en
este orden: Perfil, Tareas, Keywords, Arquitectura, Título y Meta, Schema, Rank Tracking,
Google, Contenido, TF-IDF, Auditoría, Enlaces, Canibalizaciones, Competidores, Geogrid
(solo si el proyecto es negocio local con coordenadas), Informe, Copilot.

- **Tareas** (Módulo 2, ampliado): CRUD manual de to-dos (texto + fecha límite
  opcional) **más** generación automática — al completarse una auditoría,
  `generateAuditTasks()` crea una tarea por tipo de hallazgo accionable (títulos/metas
  problemáticos, H1 ausente/duplicado, enlaces rotos, contenido fino, sin HTTPS...),
  identificadas por el prefijo `🔍 [Auditoría <fecha>]`. La siguiente auditoría marca
  `done` las automáticas anteriores antes de crear las nuevas — no se acumulan tareas
  obsoletas. Las tareas manuales nunca se tocan.
- **Keywords** (Módulo 1): espacio de trabajo tipo Planificador por estudio.
  Siembras una keyword → DataForSEO Labs (`keyword_suggestions`) devuelve relacionadas
  con volumen/competición/CPC/intención ya resueltos (se cachean al traerlas, así
  añadir después es gratis) → añades/quitas las que interesan → ese conjunto ES el
  estudio; las prioridades se recalculan en cada cambio. Alternativa de "pegar lista"
  (resuelve vía caché + volumen/intención) sigue disponible. Sobre el estudio:
  "Generar estructura de URLs" (vía OpenRouter). Solo DataForSEO como fuente por ahora
  (Google Ads, fuente alternativa, pendiente).
- **Arquitectura**: visualiza `KeywordStudy.structure` (la misma "Generar estructura de
  URLs" del Módulo 1) como árbol en abanico horizontal — clic en una rama despliega sus
  páginas hijas con la URL completa propuesta. `src/lib/keywords/structure-tree.ts`
  agrupa las `slug` (rutas planas tipo "servicios/cambio-cerradura") por segmento de
  ruta y calcula el volumen de cada rama sumando el `searchVolume` real de las keywords
  que reclama (cruzado contra `Keyword`, nunca estimado), ordenando cada nivel por ese
  volumen. Sin estructura generada todavía, permite generarla desde aquí (mismo
  endpoint del Módulo 1).
- **Título y Meta** (Módulo 3): URL → scraping real → 3 variantes de título/meta
  descripción vía OpenRouter, siguiendo [`docs/seo-rules.md`](./docs/seo-rules.md).
  Keyword objetivo manual opcional (puede venir del Módulo 1 cuando exista estudio).
- **Schema** (Módulo 4): URL → analizar (heurística, sin LLM) → confirmar/cambiar tipo
  en un catálogo data-driven de ~20 tipos de schema.org (combobox buscador agrupado
  por categoría) → generar JSON-LD. Catálogo + builder/validador genéricos en
  `src/lib/seo/schema/`. `LocalBusiness`, `Organization`, `WebSite` y `BreadcrumbList`
  son deterministas (derivados del proyecto/página, sin coste de LLM); el resto usan
  un ÚNICO prompt LLM genérico parametrizado por las propiedades reales del tipo en
  schema.org y quedan registrados en `ApiUsageLog`. Añadir un tipo = añadir una
  entrada al catálogo, sin tocar builders ni validadores.
- **Rank Tracking** (Módulo 5): keywords seguidas por proyecto (desacopladas de los
  estudios) → "comprobar ahora" síncrono vía DataForSEO SERP o frecuencias
  programadas (diaria/semanal/mensual) que procesa el cron. `depth` configurable
  (10/30/50/100, default 10) por keyword — a mayor depth, mayor coste. Ubicación real
  opcional por keyword (comunidad/provincia/ciudad/municipio, `LocationPicker` — datos
  reales de `GET /v3/serp/google/locations/ES`, sin coste): sin elegir nada, España
  nacional (`locationCode` 2724). Posición actual con flecha de tendencia, mejor
  histórica y sparkline de evolución. Importa keywords desde un estudio del Módulo 1.
  Solo orgánico (Geogrid → Módulo 9). Cada chequeo alimenta `SerpCache` (reutilizada por
  TF-IDF) y dispara un aviso por email si la posición cae ≥10.
- **Google** (Módulo 6): si no hay conexión de agencia, enlaza a Configuración. Si la
  hay, selectores de propiedad de Search Console y GA4 (Business Profile deshabilitado,
  pendiente de aprobación de Google) + dashboard de últimos 28 días (clics/impresiones
  de GSC, sesiones/conversiones de GA4). Cada fuente se degrada de forma independiente
  si falla — un token revocado o una propiedad borrada no tumba la otra fuente. Además,
  cuando hay GSC seleccionado, un **panel de Search Console** (`src/components/admin/GscPanel.tsx`,
  ruta `/api/proyectos/[id]/google/search-console`) explota a fondo `searchanalytics.query`:
  KPIs (clics/impresiones/CTR/posición), top queries reales y top páginas (con tendencia
  vs. periodo anterior; hasta 250 cada una con "ver más"), desglose por dispositivo y país,
  evolución mensual (12 meses) y botón para importar las queries reales como semilla de un
  estudio del Módulo 1. Periodo configurable (28 días / 3 / 6 / 12 meses). Sin nueva
  conexión ni coste: misma API. Cada apertura persiste un **`GscSnapshot`** (dedupe por
  proyecto+mes) con totales, top queries/páginas y desgloses — lo lee el Copilot
  (`src/lib/copilot/context.ts`) y queda disponible para cruzar con otros módulos sin
  volver a llamar a la API.
- **Contenido** (Módulo 7): tema + tipo (Blog/Página/Producto/Novedad GBP) + longitud
  objetivo → texto vía OpenRouter con encabezados en Markdown, usando el tono de marca
  del proyecto (`Project.toneOfVoice`). Keyword objetivo y enlaces internos a incluir
  son manuales (hasta que exista el Módulo 1) — si no se aportan, nunca se inventan.
  Generaciones agrupadas por tema (versionado): comparar versiones con diff línea a
  línea (LCS), restaurar una anterior o regenerar.
- **TF-IDF**: siembra una keyword + ubicación opcional (mismo `LocationPicker` que Rank
  Tracking) → top-10 orgánico real (vía `SerpCache` si ya existe, si no una llamada SERP
  nueva) → scraping de cada resultado → términos más relevantes por TF-IDF para orientar
  el contenido. Sin coste si el rank tracking ya consultó esa keyword/ubicación
  recientemente.
- **Auditoría** (Módulo 8): botón "Ejecutar auditoría ahora" → crea `AuditRun` pending
  → se procesa de inmediato (fire-and-forget) y también vía el cron interno como
  respaldo → rastreo del sitio (enlaces rotos, HTTPS, canonicals, meta robots,
  sitemap.xml, robots.txt, alts de imagen, títulos/metas/H1 tipo Screaming Frog,
  redirecciones, duplicados, enlaces externos), PageSpeed Insights de la home, y cruce
  de impresiones con Search Console si el proyecto tiene GSC conectado. Puntuación
  0-100 en 5 categorías explicables (indexabilidad, enlaces, on-page, rendimiento,
  accesibilidad de imágenes — nunca caja negra), con gráfico de tendencia si hay 2+
  auditorías. Completar una auditoría también genera las Tareas automáticas descritas
  arriba y dispara avisos por email.
- **Enlaces**: PageRank interno calculado sobre el grafo de enlaces de la última
  auditoría completada (`AuditRun.linkGraph`), sin coste de API — páginas huérfanas,
  hubs principales, puntuación por página.
- **Canibalizaciones**: consulta directa a Search Console (mismo query posicionando
  varias URLs en 90 días) — requiere GSC conectado para el proyecto, sin coste de
  DataForSEO/OpenRouter.
- **Competidores** (Tier 2): trackear dominios competidores → ubicación de análisis
  opcional (mismo `LocationPicker`, aplica a "Analizar" y "Gap" de toda la sesión) →
  "Analizar" pide visibilidad real vía DataForSEO Labs (tráfico estimado, nº keywords,
  top keywords, histórico de snapshots) y content gap (`domain_intersection`: keywords
  que ranquea el competidor y el proyecto no). Ver histórico ya calculado es gratis,
  solo "Analizar"/recalcular gap paga.
- **Geogrid** (Módulo 9, solo negocios locales): keyword + rejilla (3×3/5×5/7×7) + radio
  → crea `GeogridRun` pending → se procesa de inmediato y también vía el cron →
  Maps SERP en cada punto con coordenada exacta, localiza la posición del negocio
  (match por place_id/nombre/dominio) → mapa de calor verde/amarillo/rojo, con
  histórico y comparación lado a lado entre dos runs de la misma keyword. Tope de
  gasto aplicado al inicio de cada run. Cada run del histórico se puede borrar
  (icono papelera); el borrado se bloquea si está pending/running para no
  machacar el job en curso (`DELETE /api/proyectos/[id]/geogrid/[runId]`).
- **Informe**: vista HTML de solo lectura con auditoría, rank tracking, keywords,
  geogrid (si aplica) y gasto del mes, con hoja de estilos de impresión —
  "Guardar como PDF" es el propio diálogo de impresión del navegador, no hay
  generación de PDF en servidor ni versionado del informe.
- **Copilot**: chat de solo lectura vía OpenRouter con el contexto del proyecto
  (auditoría, rankings, gasto) inyectado en el system prompt. No tiene tool-calling —
  no puede modificar datos del proyecto.

## Seguridad

- Contraseñas con `bcryptjs`, nunca en texto plano
- Rate limiting de login por IP y por email (`src/lib/rate-limit.ts`)
- Cabeceras de seguridad y CSP en `next.config.ts`
- Secrets cifrados con AES-256-CBC antes de tocar BD — nunca en texto plano (token de
  Google, `AppSetting` de Configuración). Las claves editables desde Configuración
  nunca vuelven al cliente tras guardarse: la API solo expone si están configuradas y
  desde dónde (BD o `.env`), nunca el valor
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

## Gotcha de desarrollo

**Tras cualquier `prisma migrate`/`prisma generate` hay que reiniciar el dev server
(`npm run dev`).** Next.js dev NO recarga en caliente el cliente de Prisma: el proceso
sigue usando el cliente que cargó al arrancar. Si se añaden modelos/migraciones con el
dev server corriendo, las nuevas tablas (`prisma.geogridRun`, etc.) aparecen como
`undefined` en runtime (`Cannot read properties of undefined (reading 'findMany')`)
aunque el código y `tsc` estén bien. Síntoma: errores 500 en rutas que usan modelos
nuevos que desaparecen al reiniciar el dev.

## Estado y roadmap

Los 9 módulos del spec están completos, más la funcionalidad fuera de spec descrita
arriba ("Lo que estamos construyendo"). Lo que queda pendiente (Google Ads como fuente
alternativa, Business Profile API, SEO para LLMs, Link Building) está bloqueado por
coste o aprobación de terceros — ver el roadmap en
[`docs/01-vision-general.md`](./docs/01-vision-general.md).
