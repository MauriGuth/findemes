# ADR 002 — NestJS 12, ESM output, zod validation through Standard Schema

**Status:** accepted · **Date:** 2026-09-21

## Context

NestJS 12 shipped on 2026-08-27. Nova (the sibling project) runs NestJS 11 in CommonJS with `nestjs-zod`. Starting a new codebase means choosing the major that will still be current in a year and how zod schemas from `packages/shared` validate requests.

## Decision

- **NestJS 12.0.x.** Every official package already supports it (`config`, `swagger`, `throttler`, `terminus`, `bullmq`, `jwt`, `passport`). The only gap is `nestjs-zod`, which is no longer needed.
- **ESM**, exactly as `nest new` generates it in 12: `"type": "module"`, `module: nodenext`, imports with `.js` extensions, top-level `await bootstrap()`.
- **Validation** uses the built-in `StandardSchemaValidationPipe` registered globally and schemas attached to parameter decorators: `@Body({ schema: CreateTransactionSchema })`. Schemas live in `packages/shared` and are the single source of truth for the app and the API.
- **OpenAPI** for zod DTOs will use `@nestjs/swagger` 12 with `zod-openapi` 6 (installed, wired when the first DTO appears in phase 1).
- **Errors**: one global `HttpExceptionFilter` shapes every response as `{ statusCode, message, error?, issues? }`. Messages Nest generates itself (English) are replaced by Spanish generic ones; messages we throw with an object body (`new BadRequestException({ message, issues })`) are user-facing and pass through. Logs carry method, path, status and error name, never bodies, amounts or personal data.
- **Prisma 7.10** with the `prisma-client` generator (TypeScript output in `src/generated/prisma`, compiled by `nest build`) and the `pg` driver adapter. `prisma.config.ts` falls back to a placeholder URL when `DATABASE_URL` is unset: Prisma 7 refuses to load the config without one (its `env()` helper throws eagerly), yet `prisma generate` never connects and must run in Docker builds and CI without a database.

## Consequences

- Any `import` in `apps/api` must carry the `.js` extension; ESLint and `tsc` enforce the module resolution.
- `prisma` (the CLI) is a runtime dependency so `migrate deploy` can run from the production image.
- If Nova ever moves to 12 it can copy this layout; until then the two projects differ on purpose.
