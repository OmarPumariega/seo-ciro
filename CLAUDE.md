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
  token de Google; listo también para futuros secretos (API keys de DataForSEO)
- **OpenRouter** (`src/lib/seo/llm.ts`) — SDK `openai` apuntando a `https://openrouter.ai/api/v1`,
  usado por el Módulo 3 y el Módulo 4. Modelo configurable por `OPENROUTER_MODEL`, no
  hardcodeado — permite cambiar de proveedor (Claude, GPT, Gemini...) sin tocar código
- **cheerio** (`src/lib/seo/scrape.ts`) — scraping de URLs reales para Módulo 3 y 4
- **googleapis** (`src/lib/google/`) — OAuth2 + Search Console + GA4 (Admin y Data API)
  para el Módulo 6, un único paquete cubre las tres. Business Profile queda fuera hasta
  que Google apruebe el acceso a su API.
- **Infraestructura:** VPS Contabo existente, Docker, Coolify, Traefik

Fuera del esqueleto actual, previstos para cuando el módulo correspondiente lo necesite:
BullMQ + Redis (cola de tareas), DataForSEO, Google Ads API, Business Profile API,
PageSpeed Insights API.

## Esquema de base de datos (Prisma)

Ver [`docs/04-modelo-de-datos.md`](./docs/04-modelo-de-datos.md) para el detalle y la
evolución prevista por módulo. Hoy: `User` (login agencia), `Project` (cliente/dominio,
con NAP, perfil de marca y propiedad de Google seleccionada), `TitleMetaGeneration` y
`SchemaGeneration` (historial de los Módulos 3 y 4 por proyecto), `ApiUsageLog`
(registro básico de coste por llamada a OpenRouter), `GoogleConnection` (conexión OAuth2
única de la agencia con Google, Módulo 6).

## Estructura de carpetas

Ver [`docs/02-arquitectura.md`](./docs/02-arquitectura.md).

## Panel de administración — secciones

### Panel general (`/admin`)
Placeholder con contador de proyectos. Crecerá con alertas cruzadas (auditoría
pendiente, keywords bajando, tareas vencidas) cuando existan esos módulos.

### Proyectos (`/admin/proyectos`) — Módulo 2
Listar, crear y editar proyectos: nombre, dominio, NAP (si es negocio local) y perfil
de marca (tono de voz, notas). To-do list y protocolos del spec todavía no están
construidos — se añaden en una sesión dedicada al resto del Módulo 2.

### Configuración (`/admin/configuracion`)
Único ítem realmente global (no de proyecto) del sidebar aparte de Panel general y
Proyectos: conexión OAuth2 de la agencia con Google (Módulo 6). Conectar/desconectar,
ver email y scopes concedidos. La *selección de propiedad* por proyecto vive en la
ficha de cada proyecto, no aquí — la conexión es una, las propiedades son por proyecto.

### Ficha de proyecto (`/admin/proyectos/[id]/...`) — pestañas Perfil / Título y Meta / Schema / Google / Contenido
Todos los módulos salvo el 2 son inherentemente "de un proyecto", así que en vez de
añadir ítems al sidebar global se anidan como pestañas dentro de la ficha del proyecto
(`src/components/admin/ProjectSubNav.tsx`). Establece el patrón para cuando lleguen
Keyword Research, Rank Tracking, etc.

- **Título y Meta** (Módulo 3): URL → scraping real → 3 variantes de título/meta
  descripción vía OpenRouter, siguiendo [`docs/seo-rules.md`](./docs/seo-rules.md).
  Keyword objetivo manual opcional (hasta que exista el Módulo 1).
- **Schema** (Módulo 4): URL → analizar (heurística, sin LLM) → confirmar/cambiar tipo
  (LocalBusiness / Article / FAQPage) → generar JSON-LD. `LocalBusiness` es determinista
  (mapeo directo del NAP del proyecto, sin coste de LLM); `Article`/`FAQPage` usan
  OpenRouter y quedan registrados en `ApiUsageLog`.
- **Google** (Módulo 6): si no hay conexión de agencia, enlaza a Configuración. Si la
  hay, selectores de propiedad de Search Console y GA4 (Business Profile deshabilitado,
  pendiente de aprobación de Google) + dashboard de últimos 28 días (clics/impresiones
  de GSC, sesiones/conversiones de GA4). Cada fuente se degrada de forma independiente
  si falla — un token revocado o una propiedad borrada no tumba la otra fuente.
- **Contenido** (Módulo 7): tema + tipo (Blog/Página/Producto/Novedad GBP) + longitud
  objetivo → texto vía OpenRouter con encabezados en Markdown, usando el tono de marca
  del proyecto (`Project.toneOfVoice`). Keyword objetivo y enlaces internos a incluir
  son manuales (hasta que exista el Módulo 1) — si no se aportan, nunca se inventan.

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
