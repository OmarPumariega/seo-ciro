# SEO Ciro

Herramienta SEO interna de Agencia Ciro: centraliza el trabajo diario del equipo
(keyword research, títulos/metas, schema, rank tracking, integraciones de Google,
generación de contenido, auditoría técnica y geogrid local) sobre APIs reales, en
vez de depender de Ahrefs/Semrush/LocalFalcon. Cada cliente/dominio de la agencia es
un **proyecto** dentro de la misma app — no es multi-tenant por login.

**Principio no negociable:** todos los datos que muestra la app vienen de una fuente
real y verificable (DataForSEO, Google Search Console/GA4, scraping real, PageSpeed
Insights). Nada se inventa ni se estima sin fuente.

## Stack

Next.js 16 (App Router) + TypeScript + Tailwind 4 · PostgreSQL + Prisma · NextAuth
(JWT) · OpenRouter (LLM) · DataForSEO (keywords/SERP/Maps/Backlinks) · googleapis
(Search Console/GA4) · cron interno sin Redis · Docker + Coolify/Traefik en
producción.

## Empezar

```bash
npm install
cp .env.example .env   # rellena DATABASE_URL, NEXTAUTH_SECRET, ENCRYPTION_KEY
npm run db:migrate
npm run db:seed        # crea el usuario admin
npm run dev
```

Detalle completo (variables de entorno, comandos, credenciales sembradas) en
[`docs/03-entorno-desarrollo.md`](./docs/03-entorno-desarrollo.md).

> El cron interno (auditorías, rank tracking, geogrid) solo corre con
> `NODE_ENV=production` — en `npm run dev` nunca se dispara. Para probarlo de
> verdad hace falta `npm run build && npm run start`.

## Documentación

- **Para orientarte rápido (humano o IA):** [`AGENTS.md`](./AGENTS.md) — resumen del
  proyecto, stack, estado y convenciones
- **Si usas Claude Code:** [`CLAUDE.md`](./CLAUDE.md) — mismo contenido de fondo,
  con más detalle módulo a módulo
- **Documentación completa:** [`docs/README.md`](./docs/README.md) — índice
  (arquitectura, modelo de datos, spec funcional de los 9 módulos, entorno de
  desarrollo, autenticación)

## Estado

Los 9 módulos del spec original están completos, más funcionalidad añadida después
(TF-IDF, PageRank interno, Competidores, Backlinks, Copilot de IA, control de gasto,
avisos por email, tareas automáticas desde auditoría...). Ver
[`docs/01-vision-general.md`](./docs/01-vision-general.md) para el estado exacto de
cada pieza.

## Despliegue

VPS propio (Contabo) con Docker + Coolify + Traefik (SSL automático). Las
migraciones de Prisma se aplican solas al arrancar el contenedor — no hace falta
ningún paso manual de base de datos tras el deploy.
