FROM node:24-alpine

WORKDIR /app

RUN apk add --no-cache openssl tzdata

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
RUN ENCRYPTION_KEY="build-placeholder-key-32-chars--" \
    DATABASE_URL="postgresql://build:build@localhost:5432/build" \
    NEXTAUTH_URL="https://seo.agenciaciro.com" \
    NEXTAUTH_SECRET="build-placeholder" \
    npm run build

ENV NODE_ENV=production
EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && npm start"]
