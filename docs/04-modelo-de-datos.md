# 04 — Modelo de datos

Esquema actual en [`prisma/schema.prisma`](../prisma/schema.prisma), 14 modelos.

## `User`

Usuario de la agencia con acceso al panel. Un único usuario por ahora; `role` deja
preparado el terreno para multi-usuario futuro (el spec no define roles todavía).

## `Project`

Entidad central: un cliente/dominio gestionado por la agencia. De aquí colgará el
resto de módulos a medida que se construyan (keywords, rank tracking, auditorías...).

- `isLocalBusiness` + campos NAP (`businessName`, `address`, `phone`, `hours`): solo
  rellenos si el proyecto es un negocio local. El spec (Módulo 9) usa este flag para
  decidir si se muestra el check de seguimiento Geogrid en el listado de keywords.
- `toneOfVoice` / `notes`: perfil de marca, lo consumirán el Módulo 3 (títulos/metas)
  y el Módulo 7 (generador de contenido).
- `gscSiteUrl` / `ga4PropertyId` (Módulo 6): propiedad de Search Console / GA4
  seleccionada. Strings simples, no FK — son identificadores que vienen directos
  de la API de Google, no filas locales.

## `TitleMetaGeneration` (Módulo 3)

Un registro por generación exitosa de título/meta descripción para una URL del
proyecto. Solo se persiste si el scraping y el parseo de la respuesta del LLM
funcionaron — los intentos fallidos no dejan fila, para que el historial del
proyecto solo muestre resultados usables. `variants` guarda las 3 variantes
(`{ title, description }`); `model` registra qué modelo de OpenRouter se usó.

## `SchemaGeneration` (Módulo 4)

Un registro por generación de schema.org (JSON-LD) validada. `suggestedType` es
la heurística automática; `selectedType` es el tipo realmente usado (puede ser
un override manual). `model` es `null` cuando el tipo es `LocalBusiness`, porque
ese caso se resuelve con un mapeo determinista de los datos NAP del proyecto —
sin llamar al LLM.

## `ApiUsageLog` (infraestructura transversal, sección 5 del spec)

Versión mínima: un registro por llamada de pago a un LLM (hoy solo `api: "openrouter"`),
con tokens y coste si la API los devuelve. `projectId` es opcional con
`onDelete: SetNull` porque es dato contable que debe sobrevivir aunque se borre
el proyecto. Sin topes de gasto ni avisos por email todavía — eso es una tarea
aparte, cuando haga falta.

## `GoogleConnection` (Módulo 6)

Conexión OAuth2 única de la agencia con Google (una cuenta para toda la agencia,
no por proyecto). Usa un id fijo (`"singleton"`) en vez de `findFirst` + lógica de
"borrar si existe" — reconectar es un simple `upsert` sobre ese id, sin hueco de
condición de carrera ni ambigüedad de qué fila es la buena. `encryptedRefreshToken`
usa `src/lib/crypto.ts` (su primer consumidor real). Sin tabla de "propiedad por
API" separada: la propiedad elegida por proyecto vive directamente en `Project`
(`gscSiteUrl`/`ga4PropertyId`), porque son identificadores opacos de Google, no
entidades locales.

## `ContentGeneration` (Módulo 7)

Un registro por generación exitosa de contenido (`blog` | `pagina` | `producto` |
`novedad_gbp`). El historial cronológico por proyecto hace de "versionado" (sección 6
del spec: comparar/recuperar) — no hace falta un modelo padre/hijo aparte, igual que
`TitleMetaGeneration`. `content` es texto plano con la jerarquía de encabezados marcada
en Markdown (`#`/`##`/`###`). Reutiliza `Project.toneOfVoice` en el prompt, sin campo
propio para el tono.

## `AuditRun` / `AuditPage` (Módulo 8)

Primer módulo con datos genuinamente anidados N-por-ejecución (hasta ~50 páginas), a
diferencia de las generaciones de una sola fila de los módulos 3/4/7 — de ahí una tabla
hija (`AuditPage`) en vez de un JSON dentro de `AuditRun`: la UI necesita listar/filtrar
páginas con problemas, y el histórico ("evolución") solo necesita los campos de
`AuditRun`, así que separarlos mantiene la consulta de historial ligera (`findMany` sin
`include`) frente a la de detalle (`include: { pages: true }`).

`AuditRun.status` (`pending`/`running`/`completed`/`failed`) lo gestiona el cron interno
de `src/instrumentation.ts` (ver `docs/02-arquitectura.md`), no una cola externa.
`categoryScores` guarda el detalle numérico de cada categoría (no solo el número final),
para que la puntuación sea auditable a mano. `psiData` es PageSpeed Insights **solo de
la home**, no por página — cada llamada tarda varios segundos, auditar cada página del
crawl sería impracticable en un job de fondo. `gscChecked` distingue "sin conexión de
Google/sin propiedad configurada" (no se afirma nada sobre indexación) de "sí se cruzó" —
y aun así `AuditPage.inSearchConsole` es una señal indirecta (impresiones en Search
Console en 90 días), no el resultado de la API de Inspección de URLs (exigiría un scope
OAuth nuevo → reconsentimiento de toda cuenta ya conectada).

## `KeywordStudy` / `Keyword` (Módulo 1)

Un "estudio" es una lista de keywords pegada por el usuario para un proyecto, con los
datos de DataForSEO ya resueltos (volumen/competición/CPC/intención) y la estructura de
URLs opcionalmente generada encima. Tope de 300 keywords por estudio (por encima del
"50-200 típico" del spec, muy por debajo del límite técnico de DataForSEO).

- `Keyword.searchVolume` `null` = DataForSEO no tiene dato. **Nunca** se fabrica un 0
  cuando el valor real es desconocido — el null es la única señal honesta.
- `competition`: `"HIGH" | "MEDIUM" | "LOW"`, tal cual lo devuelve DataForSEO.
- `intent`: `"informacional" | "mixta" | "transaccional"` — el vocabulario de 3 buckets
  del proyecto. Los 4 labels de DataForSEO (`informational`, `navigational`,
  `commercial`, `transactional`) se mapean en `mapIntent()`; `navigational`/`commercial`
  se agrupan como `mixta`.
- `priority` (0-100): cuota de volumen dentro del estudio
  (`round(volumen / volumenMáximo * 100)`). Competición y CPC **no** entran en la
  fórmula — quedan como columnas para que la agencia los pondere a mano.
- `structure` (`Json?`): propuesta de URLs/H1/encabezados generada vía OpenRouter sobre
  las keywords ya persistidas. `null` hasta que se genera; regenerar sobrescribe (sin
  versionado en v1, `updatedAt` es la pista de auditoría).

## `KeywordDataCache` (infraestructura transversal, sección 5 del spec)

Primera tabla de caché de la app ("evitar pagar dos veces por el mismo dato"). Clave por
`(keyword, idioma, ubicación)`, **no** por proyecto/estudio — el volumen de una keyword es
un dato objetivo de SERP que no depende de quién lo pidió. 30 días de frescura (`cache.ts`)
antes de volver a pagar por ella. Consecuencia correcta pero a tener en cuenta: dos
proyectos que apunten a la misma keyword comparten caché (es el comportamiento deseado
para datos objetivos); no hay `forceRefresh` por proyecto todavía.

## `RankKeyword` / `RankPosition` (Módulo 5)

Una keyword que se sigue posicionalmente para un proyecto (dominio). Desacoplada de los
estudios del Módulo 1: la posición es un atributo del proyecto, no de la investigación,
así que la misma keyword en varios estudios se rastrea una sola vez. El `device`
(desktop/mobile) define un SERP distinto → es parte de la clave única (puedes seguir la
misma keyword en los dos devices por separado).

- `lastPosition`/`bestPosition` `null` = nunca comprobada, o fuera del top-100. `bestPosition`
  solo mejora (baja) con posiciones reales; un "fuera del top-100" no empeora el histórico.
- `frequency` (`manual`/`daily`/`weekly`/`monthly`): las programadas las procesa el cron
  interno; `manual` solo se dispara desde la UI (chequeo síncrono).
- `RankPosition`: una fila por chequeo, con `position` (null = fuera del top-100 del `depth`
  pedido) y `url` (la URL del proyecto que posicionó). Indexada por (rankKeywordId, checkedAt)
  para la consulta de histórico de la gráfica de evolución.

## Evolución prevista (no construida todavía)

| Modelo futuro | Módulo | Motivo por el que no está aún |
|---|---|---|
| `GeogridRun` | 9 (Geogrid Local SEO) | Reutiliza el poller ya construido para audit + rank |

Se añaden en la sesión de planificación de cada módulo, no por adelantado, para no
migrar tablas que luego cambian de forma al conocer el caso de uso real.
