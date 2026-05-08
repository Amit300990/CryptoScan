FROM node:22 AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# ── Install dependencies ──────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/db/package.json                 lib/db/
COPY lib/api-zod/package.json            lib/api-zod/
COPY lib/api-client-react/package.json   lib/api-client-react/
COPY artifacts/api-server/package.json   artifacts/api-server/
COPY artifacts/crypto-manager/package.json artifacts/crypto-manager/
RUN pnpm install --frozen-lockfile

# ── Build shared libs ─────────────────────────────────────────────────────────
FROM deps AS build-libs
COPY lib/ lib/
RUN pnpm --filter "@workspace/db" run build            2>/dev/null || true
RUN pnpm --filter "@workspace/api-zod" run build       2>/dev/null || true
RUN pnpm --filter "@workspace/api-client-react" run build 2>/dev/null || true

# ── Build frontend ────────────────────────────────────────────────────────────
FROM build-libs AS build-frontend
COPY artifacts/crypto-manager/ artifacts/crypto-manager/
ENV PORT=3000 BASE_PATH=/
RUN pnpm --filter "@workspace/crypto-manager" run build

# ── Build API server ──────────────────────────────────────────────────────────
FROM build-libs AS build-api
COPY artifacts/api-server/ artifacts/api-server/
RUN pnpm --filter "@workspace/api-server" run build

# ── Production image ──────────────────────────────────────────────────────────
FROM node:22-slim AS runner
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY lib/db/package.json                 lib/db/
COPY lib/api-zod/package.json            lib/api-zod/
COPY lib/api-client-react/package.json   lib/api-client-react/
COPY artifacts/api-server/package.json   artifacts/api-server/
RUN pnpm install --prod --frozen-lockfile

COPY --from=build-api      /app/artifacts/api-server/dist        artifacts/api-server/dist
COPY --from=build-frontend /app/artifacts/crypto-manager/dist/public artifacts/api-server/dist/public

EXPOSE 3000
ENV NODE_ENV=production
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
