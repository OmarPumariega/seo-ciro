# 04 — Modelo de datos

Esquema actual en [`prisma/schema.prisma`](../prisma/schema.prisma), 2 modelos.

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

## Evolución prevista (no construida todavía)

| Modelo futuro | Módulo | Motivo por el que no está aún |
|---|---|---|
| `ProjectSecret` / `ApiCredential` | 6 (Integraciones Google) | No hay flujo OAuth implementado |
| `KeywordStudy` / `Keyword` | 1 (Keyword Research) | No hay integración con DataForSEO/Google Ads |
| `ApiUsageLog` | Infraestructura transversal (sección 5 del spec) | No hay llamadas de pago que registrar todavía |
| `AuditRun` | 8 (Auditoría Técnica) | Requiere el crawler + cola de tareas |
| `GeogridRun` | 9 (Geogrid Local SEO) | Requiere Módulo 5/8 y la cola de tareas |

Se añaden en la sesión de planificación de cada módulo, no por adelantado, para no
migrar tablas que luego cambian de forma al conocer el caso de uso real.
