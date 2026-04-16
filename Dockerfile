# ── Stage 1: Abhängigkeiten installieren ──────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --legacy-peer-deps

# ── Stage 2: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY . .

# Build-Argumente für Umgebungsvariablen die zur Build-Zeit benötigt werden
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY

ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

ENV NODE_OPTIONS="--max-old-space-size=1536 --max-semi-space-size=64 --expose-gc"
RUN node --max-old-space-size=1536 ./node_modules/.bin/next build

# ── Stage 3: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Kopiere nur das Nötige aus dem Build
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Sharp im Production-Image installieren (wird aus Build-Tracing ausgeschlossen wegen RAM)
RUN cd /app && npm init -y --silent 2>/dev/null && npm install --no-save --platform=linuxmusl sharp@0.34.5 2>/dev/null; rm -f package.json package-lock.json

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
