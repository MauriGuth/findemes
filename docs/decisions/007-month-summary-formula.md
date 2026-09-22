# ADR 007 — The "Hasta el 1" formula and the commitment schedule

**Status:** accepted · **Date:** 2026-09-22

## Context

The whole product is one number: how much money is left until the 1st. It must be exact, explainable, and identical on the API, in the app and in the daily reminder. Argentine habits shape the rules: credit card purchases leave the account a month later, installments are the normal way to buy, salaries are often credited on the last business day of the previous month, and rent is frequently paid a few days late.

## Decision

`computeMonthSummary(input)` in `packages/shared/src/summary` is a pure function: every input (transactions, commitments, plans, `today`) is injected; nothing reads the clock or the database. Golden tests in `compute-month-summary.test.ts` pin the numbers (T1–T4 are the four cases the phase 1 DoD demands).

Rules:

1. **Eligible** movements are ARS, not `IGNORED`, and not transfers between the user's own accounts (`isOwnTransfer`).
2. **Pending is asymmetric**: an expense counts while `PENDING` or `CONFIRMED` (when in doubt, less money); an income counts only once `CONFIRMED`. A manual income that was not classified in the form is born `PENDING` and becomes a salary candidate.
3. **Cash vs credit**: `DEBIT`, `TRANSFER`, `CASH` and `WALLET` leave the money this month; `CREDIT` goes to `statement.next`.
4. **Income** = salary linked to the month's plan (even if credited last month) → else the plan's expected income → else the previous plan, carried over and flagged `needsPlan` → else 0. Plus confirmed "other" incomes of the month.
5. **Commitments** are calendar-derived: a commitment applies to month M when `startsOn ≤ M ≤ endsOn` and it is active; installment N of T is `monthsBetween(startsOn, M) + 1`; no mutable counters. A payment settles the month named by its `commitmentMonth` (so rent paid on the 2nd still pays last month), while its cash leaves the account in the month of `occurredAt`. `unpaid = max(0, amount − Σ payments)`, so partial payments do not move the number.
6. **Previous statement**: last month's `statement.next` is a cash outflow this month until paid with a movement flagged `isStatementPayment`.
7. **`remaining = income.total − spent.cash − commitments.unpaidCash − unpaid previous statement`**. Invariant: linking a payment (commitment or statement) never changes `remaining`; it only moves money from "unpaid" to "spent".
8. `perDay = remaining / daysLeft` (half-even to cents), `null` when nothing is left or the month is over; `daysLeft` counts today.
9. USD is listed apart and never converted.

**Dates.** Postgres `DATE` columns (`startsOn`, `endsOn`, `month`, `commitmentMonth`) are calendar dates: they are converted only with `dateColumnToIso` / `isoToDateColumn` (UTC getters). `toArtCalendarDate` is for `timestamptz` instants and the clock. Mixing them shifts a date one day (and a month) back.

**Manual fingerprint.** Manual movements use `fingerprint = "manual:<uuid>"`: two identical coffees two minutes apart are legitimate; the real dedup hash arrives with the Android ingestion (phase 2).

## Consequences

- The API's `InsightsService` runs the function twice (M−1 for `previousStatement`, then M) and never computes money itself.
- `statement.next` is the calendar month's credit consumption: real card closing dates are a phase 5 concern.
- Changing any rule means changing a golden test first.
