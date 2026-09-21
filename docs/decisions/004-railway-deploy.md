# ADR 004 — API deployment on Railway

**Status:** accepted · **Date:** 2026-09-21

## Context

The API must deploy from `main` with migrations applied automatically and safely, from a pnpm workspace where the API depends on `packages/shared`.

## Decision

- **Dockerfile** at `apps/api/Dockerfile` with the **repository root as build context** (the image needs `packages/shared` and the lockfile). Stages: `deps` (`pnpm install --frozen-lockfile --filter "@findemes/api..."`), `build` (`shared` → `prisma generate` → `nest build`, then a `--prod` reinstall to drop dev dependencies), `runtime` (`node:22-bookworm-slim` + `openssl`, non-root `node` user, only `dist`, `prisma/`, `prisma.config.ts` and pruned `node_modules`).
- **`railway.json` at the repository root** (Railway reads it from the service root, which must stay `/` for the Docker context): `builder: DOCKERFILE`, `dockerfilePath: apps/api/Dockerfile`, `preDeployCommand: node_modules/.bin/prisma migrate deploy`, `healthcheckPath: /health`, `watchPatterns` limited to the API and shared packages.
- **Migrations** run in Railway's pre-deploy step, in a container built from the same image with the service variables. A failing migration blocks the release; the previous deployment keeps serving.
- **Configuration** only through environment variables validated by zod at boot (`DATABASE_URL`, `NODE_ENV`, `PORT`, `CORS_ORIGINS`, `SWAGGER_ENABLED`). No secrets in the repo.
- The Railway project is created from the dashboard by the owner; nothing in the repo holds Railway credentials.

## Consequences

- `prisma` is a production dependency and `@prisma/engines` is in `onlyBuiltDependencies`, otherwise the schema engine is missing at deploy time.
- The Docker build was validated stage by stage on a host without a Docker daemon (same COPY set, same pnpm commands, production boot, `migrate deploy`); the first real `docker build` happens on Railway.
- Pushes touching only `apps/mobile` or `docs` do not trigger a deploy.
