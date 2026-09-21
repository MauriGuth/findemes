# ADR 003 — Money and calendar representation

**Status:** accepted · **Date:** 2026-09-21

## Context

Amounts in Argentine pesos have cents, run into the hundreds of millions, and are shown as `$1.234,56`. JavaScript numbers cannot represent them exactly, and the same code must run in Node and in Hermes (Android and iOS) with identical output.

## Decision

- **Database**: `Decimal(18, 2)` plus a `Currency` enum (`ARS`, `USD`; USD is recorded, never converted). Never `Float`.
- **API and app**: amounts travel as decimal strings matching `^-?\d+(\.\d{1,2})?$` (`"1234.56"`). zod's `MoneyAmountSchema` enforces it at the edge.
- **Arithmetic** in `packages/shared/src/money` on top of **big.js** (zero dependencies, string in/out, runs on Hermes) with **half-even rounding** to cents. `allocateMoney(total, parts)` splits installments without losing or inventing cents (remainder cents go to the first installments).
- **Formatting** is hand-written (`formatArs`, `parseArs`), not `Intl.NumberFormat`: Hermes uses the device's ICU data (output varies by OS version, iOS lacks `formatToParts`) and Node with full ICU prints `"$ 1.234,56"` with a non-breaking space. Golden tests pin `$1.234,56`, `-$1.234,56`, `US$100,00`.
- **Calendar** math uses a constant UTC-3 offset (`ART_UTC_OFFSET_MINUTES`). Argentina has had no daylight saving since 2009, so `America/Argentina/Buenos_Aires` is a fixed offset in practice; this keeps the module free of Intl and date libraries. `daysLeftInMonth` counts today.
- **Schema adjustments** over the brief's starting point: UUID v7 ids, `timestamptz` everywhere, cascade deletes from `User` (account deletion is real), per-user fingerprint uniqueness (`@@unique([userId, fingerprint])`), encrypted payloads stored as `Bytes` + IV + key version instead of `jsonb`, `RawEvent.expiresAt` for the 30-day purge, `MonthPlan.month` as a `date`, `Commitment.installmentsTotal` next to `installmentsLeft`.

## Consequences

- The mobile app never does `amount * 1.21`; it calls the shared helpers.
- `Prisma.Decimal` values are converted to strings at the API boundary (`toFixed(2)`), never serialized as numbers.
- If Argentina reinstates daylight saving, `dates/tz.ts` switches to an IANA-aware implementation; the public API of the module does not change.
