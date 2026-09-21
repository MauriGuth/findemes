# ADR 001 — Monorepo tooling

**Status:** accepted · **Date:** 2026-09-21

## Context

Phase 0 needs a workspace that runs the NestJS API, the Expo app and a pure TypeScript package shared by both, on one toolchain, and that survives the first year without a migration.

## Decision

- **pnpm 10.33** workspaces with the default isolated `node_modules` (no `node-linker=hoisted`). Expo supports isolated installs since SDK 54 and `expo/metro-config` handles workspaces on its own since SDK 52, so the stock Metro config is used.
- **Turborepo 2.11** for the task graph: `build` depends on `^build` and `db:generate`; `lint`, `typecheck` and `test` depend on `^build` so `shared` is compiled before its consumers; `dev` is persistent.
- **TypeScript 6.0.3** everywhere. TypeScript 7 (the native compiler) has no compiler API yet, which breaks `nest build`, the Swagger CLI plugin and type-aware ESLint; `@nestjs/cli` 12 and the Expo SDK 57 template both pin `~6.0`.
- **ESLint 9 flat config** (typescript-eslint, `eslint-config-expo`), not ESLint 10: `eslint-config-expo` still depends on `eslint-plugin-import` 2.x whose peer range stops at 9.
- **Vitest 5** for `shared` and `api`. Decorator metadata works out of the box (no SWC plugin needed), verified by the e2e test that boots the Nest DI container.
- **`packages/shared` is built with plain `tsc`** to ESM + `.d.ts`, and every consumer (Node and Metro) imports `dist`. tsup's declaration bundler injects `baseUrl`, which TypeScript 6 rejects, and Metro cannot follow the `.js`-suffixed ESM imports in the TypeScript source.

## Consequences

- `engine-strict` is off: `@nestjs/schematics` and `@angular-devkit/*` pin the newest Node 22 patch, which blocked installs on a machine one patch behind. `engines` in `package.json` documents the floor (22.12).
- With isolated installs a React Native library may fail to resolve one of its transitive dependencies from the app. The fix is to declare it directly in `apps/mobile/package.json` (done for `react-native-css-interop`, NativeWind's JSX runtime), not to switch to hoisting.
- `pnpm-workspace.yaml` lists `onlyBuiltDependencies` (`prisma`, `@prisma/engines`, `esbuild`, `@swc/core`, `unrs-resolver`): pnpm 10 skips lifecycle scripts silently otherwise and Prisma's schema engine would be missing at `migrate deploy` time.
