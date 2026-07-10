# 01 — Visión general

SEO Ciro sustituye herramientas SEO de terceros (Ahrefs, Semrush, LocalFalcon...) por
un sistema propio de Agencia Ciro conectado a APIs reales. Cada cliente/dominio es un
**proyecto** con su propio perfil, datos e historial. Ver [`spec-original.md`](./spec-original.md)
para la especificación funcional completa de los 9 módulos.

## Estado actual (esqueleto inicial)

Esta primera fase construye únicamente la base sobre la que colgará el resto:

- ✅ Auth de agencia (login único, preparado para multi-usuario)
- ✅ Módulo 2 (Gestión de Proyecto) — CRUD básico: perfil, NAP, tono de marca
- ⬜ Módulo 1 — Keyword Research
- ✅ Módulo 3 — Título y Meta Descripción (vía OpenRouter, reglas en `docs/seo-rules.md`)
- ✅ Módulo 4 — Schema (LocalBusiness determinista + Article/FAQPage vía OpenRouter)
- ⬜ Módulo 5 — Rank Tracking
- 🟡 Módulo 6 — Integraciones Google: Search Console + GA4 vía OAuth2 único de la
  agencia; Business Profile pendiente de aprobación de acceso de Google
- ⬜ Módulo 7 — Generador de Contenido
- ⬜ Módulo 8 — Auditoría Técnica
- ⬜ Módulo 9 — Geogrid Local SEO
- ⬜ Cola de tareas (BullMQ + Redis) — se añade cuando el primer módulo la necesite
- 🟡 Control de costes de API — log básico por llamada (`ApiUsageLog`) ya en marcha desde
  el Módulo 3/4; faltan topes de gasto y avisos por email
- ⬜ Caché de resultados — se añade cuando el Módulo 1 empiece a llamar a DataForSEO

Cada uno de estos módulos se planifica y construye en una sesión dedicada, siguiendo
el orden recomendado en la sección 8 de `spec-original.md`.
