# ADR 002 — NestJS 12, ESM output, zod validation through Standard Schema

**Status:** accepted · **Date:** 2026-09-21

## Context

NestJS 12 shipped on 2026-08-27. Nova (the sibling project) runs NestJS 11 in CommonJS with `nestjs-zod`. Starting a new codebase means choosing the major that will still be current in a year and how zod schemas from `packages/shared` validate requests.

## Decision

- **NestJS 12.0.x.** Every official package already supports it (`config`, `swagger`, `throttler`, `terminus`, `bullmq`, `jwt`, `passport`). The only gap is `nestjs-zod`, which is no longer needed.
- **ESM**, exactly as `nest new` generates it in 12: `"type": "module"`, `module: nodenext`, imports with `.js` extensions, top-level `await bootstrap()`.
- **Validation** uses the built-in `StandardSchemaValidationPipe` registered globally and schemas attached to parameter decorators: `@Body({ schema: CreateTransactionSchema })`. Schemas live in `packages/shared` and are the single source of truth for the app and the API.
- **OpenAPI** for zod DTOs needs no extra library: zod 4 implements the Standard JSON Schema interface (`~standard.jsonSchema`) and `@nestjs/swagger` 12 converts it on its own, both for `@Body({ schema })` parameters and for `@ApiOkResponse({ standardSchema })`. _(Amended in phase 1: `zod-openapi` was removed before it was ever wired.)_
- **Errors**: `configureApp()` in `src/app.setup.ts` installs the same pipes and filters for `main.ts` and for the e2e tests. Validation failures answer `400 { message: 'Revisá los datos que mandaste.', issues: [{ path, message }] }` so the app can show errors per field. One global `HttpExceptionFilter` shapes every response as `{ statusCode, message, error?, issues? }`. Messages Nest generates itself (English) are replaced by Spanish generic ones; messages we throw with an object body (`new BadRequestException({ message, issues })`) are user-facing and pass through. Logs carry method, path, status and error name, never bodies, amounts or personal data.
- **Prisma 7.10** with the `prisma-client` generator (TypeScript output in `src/generated/prisma`, compiled by `nest build`) and the `pg` driver adapter. `prisma.config.ts` falls back to a placeholder URL when `DATABASE_URL` is unset: Prisma 7 refuses to load the config without one (its `env()` helper throws eagerly), yet `prisma generate` never connects and must run in Docker builds and CI without a database.

## Consequences

- Any `import` in `apps/api` must carry the `.js` extension; ESLint and `tsc` enforce the module resolution.
- `prisma` (the CLI) is a runtime dependency so `migrate deploy` can run from the production image.
- If Nova ever moves to 12 it can copy this layout; until then the two projects differ on purpose.
