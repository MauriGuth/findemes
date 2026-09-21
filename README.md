# Findemes

Personal finance app for Argentina. It captures what you pay automatically (bank and wallet notifications on Android, receipt photos) and answers one question on the home screen: **¿Cuánto me queda hasta el 1?**

The product brief, domain rules and phase plan live in [`CLAUDE.md`](./CLAUDE.md). Technical decisions are recorded in [`docs/decisions/`](./docs/decisions/).

**Status: Phase 0 (foundations).** The API boots, migrates and reports health; the app shows the placeholder home and talks to the API. No auth, no ingestion yet.

## Stack

| Layer             | What                                                                               |
| ----------------- | ---------------------------------------------------------------------------------- |
| Monorepo          | pnpm 10 workspaces + Turborepo 2, TypeScript 6.0                                   |
| `apps/api`        | NestJS 12 (ESM), Prisma 7 + PostgreSQL 17, zod 4, Swagger, Vitest                  |
| `apps/mobile`     | Expo SDK 57 + expo-router, dev client (EAS), NativeWind 4, TanStack Query, Zustand |
| `packages/shared` | Pure TypeScript: money/date utils, zod schemas (parsers arrive in phase 2)         |
| `packages/config` | Shared ESLint 9, Prettier and tsconfig presets                                     |
| Infra             | Docker Compose locally, Railway for the API, GitHub Actions CI                     |

## Setup in 10 minutes

Requirements: Node 22.12+ (`.nvmrc` says 22), Docker, and Git. pnpm comes from corepack.

```bash
corepack enable && corepack prepare pnpm@10.33.0 --activate
pnpm install

docker compose up -d                      # Postgres 17 on :5432 (+ Redis, unused for now)
cp apps/api/.env.example apps/api/.env    # defaults match docker compose
pnpm db:migrate                           # applies prisma/migrations and generates the client

pnpm dev                                  # api on :3000, shared in watch mode, Metro on :8081
```

Check it works:

- `curl localhost:3000/health` → `{"status":"ok", ...}` with `database: up`
- `http://localhost:3000/docs` → Swagger UI (development only)

### The app on your phone

Expo Go does not work (there will be a native module in phase 2); you need a **development build**.

```bash
cd apps/mobile
npx eas-cli@latest init                       # once: links the app to your Expo account
npx eas-cli@latest build --profile development --platform android
```

Install the APK, run `pnpm dev` at the repo root and open the app. The `development` profile points the app at `http://10.0.2.2:3000` (Android emulator). On a physical phone set `EXPO_PUBLIC_API_URL` to your computer's LAN IP in `apps/mobile/.env` (see `.env.example`) before building, or leave it unset: in development the app falls back to the Metro host on port 3000.

## Everyday commands

| Command                                         | What it does                                                           |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`                                      | api + shared (watch) + Metro, orchestrated by turbo                    |
| `pnpm check`                                    | lint, typecheck, unit tests and build for every package (what CI runs) |
| `pnpm --filter @findemes/api test:e2e`          | API e2e tests against the local Postgres                               |
| `pnpm db:migrate`                               | `prisma migrate dev` (creates a migration after schema changes)        |
| `pnpm db:studio`                                | Prisma Studio                                                          |
| `pnpm db:reset`                                 | drop + recreate the local database                                     |
| `pnpm format`                                   | Prettier                                                               |
| `pnpm --filter @findemes/mobile export:android` | proves the Metro bundle compiles without EAS                           |

## Repository layout

```
apps/
  api/        NestJS: src/{config,common,prisma,health}, prisma/{schema.prisma,migrations}, Dockerfile
  mobile/     Expo: app/ (routes), src/{lib,components}, modules/ (native modules, phase 2)
packages/
  shared/     src/{money,dates,schemas}; built with tsc to dist (ESM + d.ts)
  config/     eslint/, prettier/, tsconfig/
docs/
  decisions/  ADRs
  samples/    anonymized real notifications and receipts (never invented)
  privacy/    privacy policy and disclosure texts
```

## Testing

- `packages/shared`: Vitest golden tests for money math, Argentine formatting, calendar math and the zod schemas. One test reads `apps/api/prisma/schema.prisma` and fails if the enums drift.
- `apps/api`: Vitest unit tests (`src/**/*.spec.ts`) and e2e tests (`test/**/*.e2e-spec.ts`) that boot the real app against `DATABASE_URL`.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, build and the API e2e against a Postgres service, then exports the Android bundle.

## Deploy

### API on Railway

Config as code lives in [`railway.json`](./railway.json) (build with `apps/api/Dockerfile`, run `prisma migrate deploy` before every release, health check on `/health`).

1. Railway → New Project → Deploy from GitHub → this repo. Leave **Root Directory** as `/` so the Docker build context is the monorepo.
2. Add a **PostgreSQL** database to the project.
3. On the API service set the variables: `DATABASE_URL` (reference the Postgres `DATABASE_URL`), `NODE_ENV=production`, `SWAGGER_ENABLED=false`, `CORS_ORIGINS` (empty unless a web client appears). Railway injects `PORT`.
4. Deploy. The pre-deploy step applies pending migrations; a failed migration blocks the release.
5. Open `https://<service>.up.railway.app/health`.

Pushes that only touch `apps/mobile` do not redeploy the API (`watchPatterns`).

### Mobile with EAS

`eas.json` defines `development` (dev client, APK), `preview` (APK) and `production` (AAB). Set `EXPO_PUBLIC_API_URL` per profile to the Railway URL when it exists.

## Conventions

Conventional commits, `feature/<phase>-<topic>` branches, small PRs. Code, identifiers, commits and technical docs in English; UI copy in Argentine Spanish (voseo). Before calling anything done: `pnpm check`, the relevant e2e, and a manual run.
