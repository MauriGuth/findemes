# Findemes

Personal finance app for Argentina. It captures what you pay automatically (bank and wallet notifications on Android, receipt photos) and answers one question on the home screen: **¿Cuánto me queda hasta el 1?**

The product brief, domain rules and phase plan live in [`CLAUDE.md`](./CLAUDE.md). Technical decisions are recorded in [`docs/decisions/`](./docs/decisions/).

**Status: Phase 1 (manual loop).** Email-code login, manual movements, monthly plan and commitments, the "Te quedan $X hasta el 1" header computed by a pure, golden-tested function, and a local daily reminder. No automatic ingestion yet (phase 2).

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

Expo Go does not work (there will be a native module in phase 2); you need a **development build**.

```bash
cd apps/mobile
npx eas-cli@latest init                       # once: links the app to your Expo account
npx eas-cli@latest build --profile development --platform android
```

Install the APK, run `pnpm dev` at the repo root and open the app. The `development` profile points the app at `http://10.0.2.2:3000` (Android emulator). On a physical phone set `EXPO_PUBLIC_API_URL` to your computer's LAN IP in `apps/mobile/.env` (see `.env.example`) before building, or leave it unset: in development the app falls back to the Metro host on port 3000.

A rebuild is needed whenever a config plugin changes (`expo-secure-store` and `expo-notifications` were added in phase 1). To test against Railway, put the public domain in the `preview` profile of `eas.json` and build with `--profile preview`; the manual checklist is in [`docs/testing/phase-1-manual.md`](./docs/testing/phase-1-manual.md).

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

   | Variable          | Value                                                         |
   | ----------------- | ------------------------------------------------------------- |
   | `DATABASE_URL`    | reference to the Postgres service's `DATABASE_URL`            |
   | `NODE_ENV`        | `production`                                                  |
   | `JWT_SECRET`      | `openssl rand -base64 48`                                     |
   | `OTP_PEPPER`      | `openssl rand -base64 48` (a different one)                   |
   | `MAIL_PROVIDER`   | `resend`                                                      |
   | `RESEND_API_KEY`  | from resend.com → API Keys                                    |
   | `MAIL_FROM`       | `Findemes <onboarding@resend.dev>` until a domain is verified |
   | `SWAGGER_ENABLED` | `false`                                                       |
   | `CORS_ORIGINS`    | empty unless a web client appears                             |

4. Settings → Networking → **Generate Domain**. That URL goes into `eas.json` (`preview` profile) and is what the phone talks to.
5. Deploy. The pre-deploy step applies pending migrations and seeds the catalog (idempotent); a failed migration blocks the release.
6. Check `https://<domain>/health` and, after logging in from the app, that `GET /catalog/sources` returns 16 rows.

Without a verified domain, Resend delivers `onboarding@resend.dev` only to the email of your Resend account: enough for one real user, not for other testers (phase 5).

Pushes that only touch `apps/mobile` or `docs` do not redeploy the API (`watchPatterns`).

### Mobile with EAS

`eas.json` defines `development` (dev client, APK, local API), `preview` (APK, Railway API at `findemesapi-production.up.railway.app`) and `production` (AAB). Nothing in this repo deploys to Vercel.

## Conventions

Conventional commits, `feature/<phase>-<topic>` branches, small PRs. Code, identifiers, commits and technical docs in English; UI copy in Argentine Spanish (voseo). Before calling anything done: `pnpm check`, the relevant e2e, and a manual run.
