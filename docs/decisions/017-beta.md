# 017 — Beta: recurring suggestions, CSV export, public legal pages, retention

Date: 2026-10-14 · Status: accepted (delegated by Mauricio: "completá todo el plan")

## Context

Phase 7 (ADR 011) prepares the beta: detect recurring payments and suggest commitments, installments, CSV export, UI and onboarding polish, published policies, closed testing on Play and TestFlight, and retention analytics (PostHog or similar). DoD: 30 real users and weekly retention measured.

## Decisions

- **Recurring suggestions** (`detectRecurring` in shared, `GET /suggestions/commitments`): an expense with the same merchant (normalized; manual ones from what was typed) in at least 3 of the last 4 calendar months, within ±25% of the median amount and ±6 days of the median day, not linked to a commitment and not named like one. "Sumar como fijo" creates a SUBSCRIPTION commitment with the latest amount, median day and most common method (editable later); "No es fijo" stores the key in `User.dismissedRecurring`. Installments already have their own flow since Phase 1 (`POST /transactions/installments`).
- **CSV export** (`GET /exports/transactions.csv?from&to`, up to 24 periods): `;` separator, decimal comma and a BOM so Excel in Spanish opens it right; cells starting with `= + - @` are prefixed with `'` (CSV injection). The app writes it to the cache (`expo-file-system`) and opens the share sheet (`expo-sharing`); both are new native dependencies pinned by the SDK.
- **Public legal pages** served by the API (no web app, CLAUDE.md): `/legal/privacy` renders `docs/privacy/privacy-policy.md` (shipped in the image), and `/legal/delete-account` lets anyone delete their account without the app, using the same login code and `DELETE /me` (Google Play requires a web deletion path). `LEGAL_CONTACT_EMAIL` is shown on both. The script is a separate file because the CSP forbids inline scripts.
- **Retention without third parties**: instead of PostHog (an SDK with several native dependencies and another processor to disclose), the JWT guard marks `ActivityDay(userId, day)` once per user and day. `GET /admin/retention` (header `x-admin-token` = `ADMIN_TOKEN`; 404 without it) returns weekly active users and weekly cohorts (users active 1–4 weeks after signing up). No content, device or IP is recorded. PostHog can still be added later for funnels.
- **Closed testing** is account work for Mauricio: Play Console (US$25) internal → closed testing with the `production` profile (AAB), the privacy URL and the deletion URL above in the store listing, and the data-safety form (data collected: email, financial info from notifications/email/photos, all encrypted in transit, deletable). TestFlight per ADR 016.

## Consequences

- The privacy page shows exactly the reviewed text in the repo; until Mauricio removes "borrador" from it, it says so publicly. Review it before submitting to the stores.
- The retention numbers count any authenticated request (opening the app counts).
