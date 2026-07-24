# ============================================================
# SEO CIRO — build multi-stage.
#
# builder: instala TODO (incluye devDependencies) y compila Next.js.
# runner:  reinstala SOLO dependencias de producción (npm ci --omit=dev)
#          → imagen final más ligera, sin typescript/eslint/tailwind/@types.
#
# Nota: no usamos `output: standalone` porque el CMD de arranque ejecuta
# `prisma migrate deploy`, cuyo CLI arrastra dependencias externas pesadas
# (@electric-sql/pglite, hono, chart.js...) que no caben en el node_modules
# mínimo que traza Next. Multi-stage + --omit=dev reduce tamaño sin romper
# las migraciones automáticas.
# ============================================================

# ---------- Builder ----------
FROM node:24-alpine AS builder
WORKDIR /app

RUN apk add --no-cache openssl tzdata

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate

# VPS Contabo muy cargado: Turbopack pedía tanta RAM en pico que el kernel lo
# mataba (OOM kill en el build de Coolify). Limitar el heap de Node evita que
# el paso de `next build` compita por memoria con el resto de servicios.
RUN NODE_OPTIONS="--max-old-space-size=2048" \
    ENCRYPTION_KEY="build-placeholder-key-32-chars--" \
    DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    NEXTAUTH_URL="https://seo.agenciaciro.com" \
    NEXTAUTH_SECRET="build-placeholder" \
    npm run build

# ---------- Runner ----------
FROM node:24-alpine AS runner
WORKDIR /app

RUN apk add --no-cache openssl tzdata

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Solo dependencias de producción (sin devDependencies → imagen más ligera)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Schema, migraciones y config de Prisma (necesarios para migrate deploy)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./
# Genera el cliente Prisma en el runner (npm ci no lo genera solo)
RUN npx prisma generate

# Build de Next.js ya compilado en el builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.ts ./

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm run start"]
