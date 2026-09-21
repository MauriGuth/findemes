# syntax=docker/dockerfile:1.7
# Build context is the repository root:  docker build -f apps/api/Dockerfile .
# Railway picks this up through railway.json (dockerfilePath).

# ─── base: node + pnpm ────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo

# ─── deps: install only what the api needs (api + shared + config) ────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/config/package.json packages/config/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@findemes/api..."

# ─── build: shared → prisma client → nest ─────────────────────────────────────
FROM deps AS build
COPY turbo.json ./
COPY packages/config packages/config
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @findemes/shared build \
 && pnpm --filter @findemes/api db:generate \
 && pnpm --filter @findemes/api build
# Drop dev dependencies from node_modules (offline, from the store).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@findemes/api..."

# ─── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime
# openssl: needed by the Prisma schema engine that runs `migrate deploy`.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /repo

COPY --from=build --chown=node:node /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build --chown=node:node /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build --chown=node:node /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build --chown=node:node /repo/apps/api/package.json /repo/apps/api/prisma.config.ts ./apps/api/
COPY --from=build --chown=node:node /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=node:node /repo/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /repo/apps/api/node_modules ./apps/api/node_modules

USER node
WORKDIR /repo/apps/api
EXPOSE 3000
# Migrations run before each release via railway.json → preDeployCommand.
CMD ["node", "dist/main.js"]
