# 03 — Entorno de desarrollo

## Requisitos

- Node.js 24 (ver `.nvmrc`)
- PostgreSQL 16 accesible (local o remoto)

## Setup

```bash
npm install
cp .env.example .env   # rellena DATABASE_URL, NEXTAUTH_SECRET, ENCRYPTION_KEY
npm run db:migrate     # crea el esquema
npm run db:seed        # crea el usuario admin (ver prisma/seed.ts)
npm run dev
```

Credenciales sembradas por defecto: `admin@agenciaciro.com` / `admin1234`
(o las que definas en `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`). Cámbialas antes
de usar en producción.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Migración Prisma (dev) |
| `npm run db:seed` | Siembra el usuario admin |
| `npm run db:studio` | Prisma Studio |

## Variables de entorno

Ver [`.env.example`](../.env.example) para la lista completa con explicación de cada una.
