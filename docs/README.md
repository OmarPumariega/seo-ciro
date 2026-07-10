# Documentación de SEO Ciro

Base de conocimiento de **SEO Ciro**, la herramienta SEO interna de **Agencia Ciro**
que centraliza el trabajo diario sobre los proyectos (clientes/dominios) de la agencia.

> Si algo no está aquí, está en el código fuente (referenciado con `archivo:linea`)
> o no existe todavía.

## Empezar aquí

- **Quiero entender qué es esto** → [`spec-original.md`](./spec-original.md) (spec
  funcional completa de los 9 módulos) y [`01-vision-general.md`](./01-vision-general.md)
- **Voy a desarrollar** → [`03-entorno-desarrollo.md`](./03-entorno-desarrollo.md) y
  [`02-arquitectura.md`](./02-arquitectura.md)
- **Necesito el modelo de datos** → [`04-modelo-de-datos.md`](./04-modelo-de-datos.md)
- **Dudas de login/roles** → [`05-autenticacion.md`](./05-autenticacion.md)

## Índice

| Doc | Qué cubre |
|---|---|
| [spec-original.md](./spec-original.md) | Especificación funcional completa (9 módulos, APIs, costes, orden de construcción) |
| [01 — Visión general](./01-vision-general.md) | Qué está construido hoy vs. qué queda pendiente del spec |
| [02 — Arquitectura](./02-arquitectura.md) | Stack, estructura de carpetas, decisiones de infraestructura |
| [03 — Entorno de desarrollo](./03-entorno-desarrollo.md) | Setup local, variables de entorno, comandos |
| [04 — Modelo de datos](./04-modelo-de-datos.md) | Esquema Prisma actual y su evolución prevista por módulo |
| [05 — Autenticación](./05-autenticacion.md) | NextAuth, JWT, roles |

## Convenciones

- **Idioma:** español (igual que la UI y el equipo)
- **Referencias al código:** formato `ruta/del/archivo.ts:LINEA`
- **Secrets:** nunca se incluyen valores reales, solo placeholders
- Este proyecto es hermano de **Cirochat** (`../../Cirochat/cirochat-app`) y reutiliza
  sus patrones de infraestructura (auth, cifrado, Docker/Traefik) allí donde encajan
