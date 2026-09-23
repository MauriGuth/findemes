# Findemes

Personal finance app for Argentina. It captures what you pay automatically (bank and wallet notifications on Android, receipt photos) and answers one question on the home screen: **¿Cuánto me queda hasta el 1?**

The product brief, domain rules and phase plan live in [`CLAUDE.md`](./CLAUDE.md). Technical decisions are recorded in [`docs/decisions/`](./docs/decisions/).

**Status: Phase 2 (Android ingestion).** On top of the Phase 1 manual loop: an Android native module that reads only whitelisted bank and wallet notifications, uploads them with a per-device ingest token, and a server pipeline that stores them encrypted, parses them with versioned templates (Claude as fallback) and deduplicates them. Parsers for real apps land as real samples arrive.

## Stack

| Layer             | What                                                                                |
| ----------------- | ----------------------------------------------------------------------------------- |
| Monorepo          | pnpm 10 workspaces + Turborepo 2, TypeScript 6.0                                    |
| `apps/api`        | NestJS 12 (ESM), Prisma 7 + PostgreSQL 17, zod 4, Swagger, Vitest                   |
| `apps/mobile`     | Expo SDK 57 + expo-router, dev client (EAS), NativeWind 4, TanStack Query, Zustand  |
| `packages/shared` | Pure TypeScript: money/date utils, zod schemas, the month summary formula, reminder |
| `packages/config` | Shared ESLint 9, Prettier and tsconfig presets                                      |
| Infra             | Docker Compose locally, Railway for the API, GitHub Actions CI                      |

## Setup in 10 minutes

Requirements: Node 22.12+ (`.nvmrc` says 22), Docker, and Git. pnpm comes from corepack.

```bash
corepack enable && corepack prepare pnpm@10.33.0 --activate
pnpm install

docker compose up -d                      # Postgres 17 on :5432 (+ Redis, unused for now)
cp apps/api/.env.example apps/api/.env    # defaults match docker compose; dev-only secrets included
pnpm db:migrate                           # applies prisma/migrations and generates the client
pnpm --filter @findemes/api build && pnpm --filter @findemes/api db:seed   # sources + categories

pnpm dev                                  # api on :3000, shared in watch mode, Metro on :8081
```

Check it works:

- `curl localhost:3000/health` → `{"status":"ok", ...}` with `database: up`
- `http://localhost:3000/docs` → Swagger UI (development only)
- Sign in from the app or Swagger: `POST /auth/request-code` prints the 6-digit code in the API console (`MAIL_PROVIDER=console`); there is no development bypass.

Environment variables are documented in [`apps/api/.env.example`](./apps/api/.env.example) and validated at boot (`src/config/env.schema.ts`). Generate real secrets with `openssl rand -base64 48`.

### The app on your phone

Expo Go does not work (there will be a native module in phase 2); you need a **development build**. Build it once and reinstall only when something native changes (a new Expo module, a config plugin, permissions):

```bash
cd apps/mobile
npx eas-cli@latest build --profile development --platform android
```

Install the APK, then serve the JavaScript from your computer. The phone must be on the same Wi-Fi:

```bash
cd apps/mobile
pnpm dev:railway      # the app talks to the Railway API
pnpm dev              # the app talks to EXPO_PUBLIC_API_URL from apps/mobile/.env (a local API)
```

Open the app and pick the server Metro shows (or scan its QR). JavaScript changes reload on save: no new build and no EAS cost. The `preview` profile is a standalone APK (no computer needed) pointed at Railway; use it to hand the app to someone or before a release.

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

- `packages/shared`: Vitest golden tests for money math, Argentine formatting, calendar math, the zod schemas, the `computeMonthSummary` formula (the four DoD cases: salary not yet credited, installment, credit vs debit, own transfer, plus edge cases) and the reminder schedule. One test reads `apps/api/prisma/schema.prisma` and fails if the enums drift.
- `apps/api`: Vitest unit tests (`src/**/*.spec.ts`) and e2e tests (`test/**/*.e2e-spec.ts`) that boot the real app against `DATABASE_URL` with `MAIL_PROVIDER=fake`, a fake clock and throttling off (one test turns it on). `test/helpers/db.ts` refuses to run against a non-local database unless `E2E_ALLOW_REMOTE_DB=1`.
- CI (`.github/workflows/ci.yml`) runs lint, typecheck, unit tests, build and the API e2e against a Postgres service, then exports the Android bundle.

## Deploy

### API on Railway

Config as code lives in [`railway.json`](./railway.json): build with `apps/api/Dockerfile`, run `prisma migrate deploy && node dist/seed.js` before every release, health check on `/health`. Because it is config-as-code, the service must **not** set a custom build or start command in the dashboard (the runtime image has no pnpm; the Dockerfile `CMD` starts the API).

1. Railway → New Project → Deploy from GitHub → this repo, one service for the API. Leave **Root Directory** as `/` so the Docker build context is the monorepo. Do not create a service for `apps/mobile` (it is built by EAS, not Railway).
2. Add a **PostgreSQL** database to the project.
3. On the API service set the variables (Railway injects `PORT`):

   | Variable            | Value                                                                                      |
   | ------------------- | ------------------------------------------------------------------------------------------ |
   | `DATABASE_URL`      | reference to the Postgres service's `DATABASE_URL`                                         |
   | `NODE_ENV`          | `production`                                                                               |
   | `JWT_SECRET`        | `openssl rand -base64 48`                                                                  |
   | `OTP_PEPPER`        | `openssl rand -base64 48` (a different one)                                                |
   | `MAIL_PROVIDER`     | `resend`                                                                                   |
   | `RESEND_API_KEY`    | from resend.com → API Keys                                                                 |
   | `MAIL_FROM`         | `Findemes <onboarding@resend.dev>` until a domain is verified                              |
   | `SWAGGER_ENABLED`   | `false`                                                                                    |
   | `CORS_ORIGINS`      | empty unless a web client appears                                                          |
   | `RAW_EVENT_KEY`     | `openssl rand -base64 32` (automatic capture; without it the API answers 503 on /ingest)   |
   | `ANTHROPIC_API_KEY` | from console.anthropic.com (Claude fallback; without it unknown formats stay unrecognized) |
   | `LLM_DAILY_CAP`     | optional, default 30 Claude calls per user per day                                         |

4. Settings → Networking → **Generate Domain**. That URL goes into `eas.json` (`preview` profile) and is what the phone talks to.
5. Deploy. The pre-deploy step applies pending migrations and seeds the catalog (idempotent); a failed migration blocks the release.
6. Check `https://<domain>/health` and, after logging in from the app, that `GET /catalog/sources` returns 16 rows.

Without a verified domain, Resend delivers `onboarding@resend.dev` only to the email of your Resend account: enough for one real user, not for other testers (phase 5).

Pushes that only touch `apps/mobile` or `docs` do not redeploy the API (`watchPatterns`).

### Mobile with EAS

`eas.json` defines `development` (dev client, APK, local API), `preview` (APK, Railway API at `findemesapi-production.up.railway.app`) and `production` (AAB). Nothing in this repo deploys to Vercel.

## Conventions

Conventional commits, `feature/<phase>-<topic>` branches, small PRs. Code, identifiers, commits and technical docs in English; UI copy in Argentine Spanish (voseo). Before calling anything done: `pnpm check`, the relevant e2e, and a manual run.
