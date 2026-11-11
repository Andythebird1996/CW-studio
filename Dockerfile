# ── Stage 1: Build frontend ────────────────────────────────────────────────
FROM oven/bun:1 AS builder
WORKDIR /app

# Install all workspace deps (needs all package.json + lockfile)
COPY package.json bun.lock ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN bun install --frozen-lockfile

# Build Vite frontend → frontend/dist/
COPY frontend/ frontend/
RUN bun run --cwd frontend build

# ── Stage 2: Runtime ───────────────────────────────────────────────────────
FROM oven/bun:1-slim AS runner
WORKDIR /app

# Install backend production deps only
COPY backend/package.json package.json
RUN bun install --production

# Backend source (Bun runs TypeScript natively)
COPY backend/src/ src/

# Built frontend served as static files
COPY --from=builder /app/frontend/dist/ public/

EXPOSE 3001
ENV NODE_ENV=production

CMD ["bun", "run", "src/server.ts"]
