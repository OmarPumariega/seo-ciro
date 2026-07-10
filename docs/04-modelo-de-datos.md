# 04 — Modelo de datos

Esquema actual en [`prisma/schema.prisma`](../prisma/schema.prisma), 6 modelos.

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

## Evolución prevista (no construida todavía)

| Modelo futuro | Módulo | Motivo por el que no está aún |
|---|---|---|
| `KeywordStudy` / `Keyword` | 1 (Keyword Research) | No hay integración con DataForSEO/Google Ads |
| `AuditRun` | 8 (Auditoría Técnica) | Requiere el crawler + cola de tareas |
| `GeogridRun` | 9 (Geogrid Local SEO) | Requiere Módulo 5/8 y la cola de tareas |

Se añaden en la sesión de planificación de cada módulo, no por adelantado, para no
migrar tablas que luego cambian de forma al conocer el caso de uso real.
