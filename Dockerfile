# ── Stage 1: install dependencies ──────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# ── Stage 2: build the SPA ──────────────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN npm run build

# ── Stage 3: web server (serves SPA + /_sessions/ proxy) ───────────────────
FROM node:22-alpine AS web
WORKDIR /app

# Install only mime-types for the production server
RUN npm install mime-types

COPY --from=builder /app/dist ./dist
COPY docker/server.mjs ./server.mjs

EXPOSE 3000
CMD ["node", "server.mjs"]

# ── Stage 4: indexer (build-index --watch) ─────────────────────────────────
FROM node:22-alpine AS indexer
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./
COPY scripts/build-index.ts ./scripts/

# --sessions-dir is passed from docker-compose via CMD / env
CMD ["npx", "tsx", "scripts/build-index.ts", "--sessions-dir", "/sessions", "--watch"]
