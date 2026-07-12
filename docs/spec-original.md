# Especificación Técnica — Herramienta SEO Centralizada (Agencia Ciro)

## 1. Resumen ejecutivo

SaaS interno multi-tenant para centralizar las herramientas SEO usadas a diario en la agencia (Agencia Ciro), sustituyendo múltiples herramientas de terceros por un sistema propio conectado a APIs reales y fiables. Cada cliente/dominio es un "proyecto" con su propio perfil, datos, historial y configuración.

**Principio no negociable:** todos los datos mostrados deben proceder de fuentes reales y verificables (APIs oficiales). Ningún dato se inventa o estima sin fuente.

---

## 2. Stack tecnológico propuesto

- **Frontend/Backend:** Next.js 14 (App Router) — mismo stack que Cirochat, reutiliza conocimiento existente
- **Base de datos:** PostgreSQL + Prisma ORM
- **Cola de tareas / jobs en background:** BullMQ + Redis (crawler, rank tracking programado, auditorías automáticas)
- **IA:** Claude API (Sonnet) — clasificación de intención, generación de contenido, títulos/metas, schema, análisis
- **Infraestructura:** Contabo VPS existente, Docker, Coolify, Traefik
- **Auth:** NextAuth (JWT), un único usuario por ahora, diseñado para multi-usuario futuro
- **Cifrado de secretos:** variables sensibles (API keys, tokens OAuth) cifradas en BD, nunca en texto plano

---

## 3. APIs externas necesarias

| API | Uso | Coste |
|---|---|---|
| DataForSEO | Volumen de búsqueda, intención, SERP (rank tracking) | Pago por uso (bajo) |
| Google Ads API | Keyword Planner alternativo | Gratis (requiere developer token + cuenta Ads) |
| Google Search Console API | Consultas, clics, impresiones, indexación | Gratis |
| Google Analytics (GA4) API | Tráfico, conversiones | Gratis |
| Google Business Profile API | Reseñas, llamadas, vistas de ficha | Gratis |
| Google PageSpeed Insights API | Core Web Vitals, rendimiento | Gratis (con cuota) |
| Claude API (Anthropic) | Generación y análisis de contenido | Pago por uso |

**Autenticación Google:** una sola cuenta OAuth2 (la del usuario/gestor de la agencia), heredando el acceso ya concedido en las cuentas de cada cliente. Selector de propiedad GSC/GA4/GBP por proyecto.

---

## 4. Módulos funcionales

### Módulo 1 — Keyword Research
- Estudio de keywords con datos reales de volumen (DataForSEO y/o Google Ads, seleccionable)
- Clasificación automática de intención: informacional / mixta / transaccional
- Generación de árbol de URLs, jerarquía de encabezados (H1-H6) y estructura de menú
- Priorización automática por volumen/importancia
- 50-200 keywords por estudio típico, multi-proyecto

### Módulo 2 — Gestión de Proyecto
- Perfil por cliente/dominio: datos NAP (nombre, dirección, teléfono, horario), tono de voz/marca
- To-do list manual (sin generación automática de tareas)
- Protocolos: plantillas globales reutilizables + personalización por proyecto sin alterar la plantilla base
- Registro de resultados y checks de objetivos/KPIs

### Módulo 3 — Generador de Título y Meta Descripción
- Input: URL → scraping de contenido real de la página
- Generación siguiendo reglas propias (base: `seo-rules.md` existente, mejorado)
- Usa la keyword objetivo del proyecto si existe estudio asociado (Módulo 1)
- Límites de caracteres optimizados (title ~60 car., meta ~155-160 car.)
- Uso URL por URL (sin modo masivo)

### Módulo 4 — Generador de Schema (Datos Estructurados)
- Input: URL del proyecto → scraping + datos NAP del perfil
- Sugerencia automática del tipo de schema (LocalBusiness, Article, Product, FAQ, etc.) con opción de cambio manual
- Salida en JSON-LD
- Validación del schema antes de mostrarlo

### Módulo 5 — Rank Tracking
- Seguimiento de posiciones vía DataForSEO SERP API
- En el listado de keywords del proyecto, cada keyword tiene checks independientes de seguimiento: ☐ Orgánico (este módulo) y ☐ Geogrid (módulo 9, solo visible si el proyecto tiene NAP configurado como negocio local) — no es un único "a seguir sí/no", cada tipo se activa por separado
- Frecuencia configurable por keyword/proyecto (diaria/semanal/mensual/manual)
- Histórico con gráfica de evolución
- Sin seguimiento de competidores en esta fase

**Fase 2 (pendiente, no incluida en el MVP):** seguimiento de posicionamiento en buscadores de IA (Google AI Overview, ChatGPT, Perplexity, Gemini). La fuente más fiable (DataForSEO LLM Mentions API) exige un compromiso mínimo de $100/mes para acceder al endpoint, muy por encima del resto de APIs de pago por uso. Se deja pendiente de validar demanda real de clientes o de que surja una alternativa de coste más ajustado, dado que es una categoría de mercado todavía emergente.

### Módulo 6 — Integraciones Google (GSC + GA4 + GBP)
- Conexión OAuth2 única (cuenta de la agencia)
- Selector de propiedad por proyecto (GSC, GA4, GBP)
- Dashboard cruzado automático con datos de las 3 fuentes
- Cruce con Módulo 1 (¿la keyword planeada está posicionando?) y Módulo 3 (¿el título optimizado mejora CTR?)

### Módulo 7 — Generador de Contenido
- Input: tema, keyword principal, URL destino, tipo de contenido (Blog / Página / Producto / Novedad GBP)
- Usa keyword + intención del Módulo 1, tono de marca del Módulo 2, enlazado interno sugerido desde el árbol de URLs del Módulo 1
- Longitudes configurables por tipo de contenido
- Salida en texto plano con jerarquía de encabezados marcada

### Módulo 8 — Auditoría Técnica
- Crawler propio del sitio completo (todas las URLs internas), respetando robots.txt
- Core Web Vitals vía PageSpeed Insights API
- Cruce de indexación con Search Console (Módulo 6)
- Enlaces rotos, códigos de respuesta, canonicals, meta robots, sitemap.xml, HTTPS, alts de imagen
- Ejecución manual + opción de programación automática (ej. mensual)
- Score global de salud técnica + desglose por categoría, con histórico de evolución
- Requiere cola de tareas en background (no bloqueante)

### Módulo 9 — Geogrid Local SEO
- Mapa de calor de posicionamiento en Google Maps/Local Pack alrededor de la ubicación del negocio
- Rejilla de puntos (ej. 3x3, 5x5, 7x7) y radio de cobertura configurables por proyecto
- Consulta de posición del negocio en cada punto de la rejilla para una keyword dada, vía DataForSEO Google Maps SERP API con coordenadas exactas (lat/long)
- Visualización tipo semáforo (verde/amarillo/rojo) según posición obtenida en cada punto
- El check "Seguimiento Geogrid" solo aparece en el listado de keywords si el proyecto tiene datos NAP configurados (negocio local) — no se muestra en proyectos no locales
- Ejecución manual bajo demanda + opción de programación automática
- Reutiliza la cola de tareas en background ya definida para rank tracking y auditorías
- **Fuente de datos:** no existe API oficial de Google para ranking geolocalizado; se usa el mismo método estándar del sector (DataForSEO, igual que LocalFalcon/BrightLocal): consulta real a Google Maps simulando la ubicación exacta, sobre datos públicamente visibles

---

## 5. Infraestructura transversal (imprescindible)

- **Control de costes de API:** cada llamada a DataForSEO y Claude API queda registrada (proyecto, API, endpoint, coste, fecha). Panel de consumo acumulado por proyecto y por API. Topes de gasto configurables (mensual, por proyecto o global), con aviso por email al acercarse al límite y opción de bloquear nuevas llamadas al superarlo
- **Caché de resultados:** evitar pagar dos veces por el mismo dato (ej. volumen de keyword ya consultado en los últimos 30 días)
- **Cola de tareas (BullMQ + Redis):** para crawler, rank tracking programado y auditorías automáticas
- **Exportación de informes:** PDF o vista compartible de auditoría, keyword research y rank tracking
- **Autenticación:** login básico (NextAuth/JWT), preparado para multi-usuario futuro
- **Gestión de secretos:** API keys y tokens OAuth cifrados en base de datos

## 6. Infraestructura adicional (recomendable, incluida)

- **Dashboard general:** vista de todos los proyectos con alertas (auditoría pendiente, keywords bajando, tareas vencidas)
- **Notificaciones por email:** avisos automáticos (caída de posición, auditoría completada, tarea vencida)
- **Versionado de contenido generado:** histórico de versiones de textos del Módulo 7 para comparar/recuperar

---

## 7. Estimación de costes de APIs (verificado julio 2026)

| API | Modelo de precio | Estimación mensual (10-15 clientes activos) |
|---|---|---|
| DataForSEO (keywords, SERP, geogrid) | Pago por uso, sin cuota fija. Depósito mínimo $50 (no recurrente, dura meses). $1 crédito gratis al registrarte | $10-25/mes en consumo real (geogrid: ~$0.0006/punto de rejilla, prácticamente marginal) |
| DataForSEO LLM Mentions (seguimiento IA) | Fase 2, no incluido en MVP. Compromiso mínimo $100/mes | No presupuestado por ahora |
| Claude API (Sonnet) | $3/$15 por millón de tokens entrada/salida (precio estándar desde sept. 2026; ahora mismo introductorio $2/$10 hasta 31 ago. 2026) | $20-50/mes según volumen de contenido generado |
| Google Search Console, GA4, Business Profile, PageSpeed Insights, Google Ads API | Gratuitas | 0€ |
| Infraestructura (VPS, Redis) | Ya existente (Contabo/Coolify) | Coste marginal ~0€ |

**Total estimado:** ~35-75€/mes en APIs de pago, muy por debajo de las herramientas de terceros equivalentes (Ahrefs/Semrush: 130-500€/mes cada una). Nota: DataForSEO actualizó tarifas +20% el 1 de julio de 2026; revisar precios vigentes antes de presupuestar en firme.

---

## 8. Orden de construcción recomendado

1. Módulo 2 (Gestión de Proyecto) — esqueleto base del que cuelga todo lo demás
2. Infraestructura base: auth, secretos, caché, cola de tareas
3. Módulo 1 (Keyword Research)
4. Módulo 3 y Módulo 4 (rápidos, resultados visibles pronto)
5. Módulo 6 (Integraciones Google)
6. Módulo 5 (Rank Tracking)
7. Módulo 7 (Generador de Contenido)
8. Módulo 8 (Auditoría Técnica) — el más pesado en infraestructura, junto al crawler
9. Módulo 9 (Geogrid Local SEO) — reutiliza la cola de tareas ya construida para el módulo 5/8
10. Capas de valor añadido: dashboard general, notificaciones email, exportación de informes, versionado

---

## 9. Riesgos y puntos de atención

- **OAuth con Google:** configurar scopes correctos por API; considerar verificación de Google Cloud si se escala más allá del modo "testing"
- **Crawler (Módulo 8):** pieza de infraestructura más compleja; diseñar con control de profundidad, rate limiting propio y respeto de robots.txt para no tumbar sitios pequeños
- **Coste variable de APIs:** DataForSEO y Claude API son pago por uso; el panel de control de costes (sección 5) es clave para evitar sorpresas
