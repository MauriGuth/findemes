# ADR 010 — Notification parsing: templates first, Claude as fallback

**Status:** accepted · **Date:** 2026-09-23

## Decision

- **Templates are code, rows are their published versions.** Each template lives in `packages/shared/src/parsers/templates` (regex with named groups + a field map with fixed direction and method, a confidence and a priority) and enters only with real, anonymized fixtures under `__fixtures__/<source>/`. The seed (pre-deploy) publishes a new `ParserTemplate` version when a definition changes and deactivates versions and names that disappeared; rows are never deleted. A new template reaches users with an API deploy, never an app release.
- **Engine** (`parseNotification`, pure, in `shared`): the first template by priority whose regex matches with a valid, positive amount wins. `notificationText()` defines the exact text templates and fixtures see.
- **Status.** Expenses confirm on their own at confidence ≥ 0.90; below that, or when a manual entry of the same amount is within 10 minutes, they stay PENDING. Incomes are always PENDING, because the user classifies them (salary / other / own transfer) as in Phase 1.
- **Dedup.** `fingerprint = sha256(userId | sourceId | amount | 2-minute bucket | merchantNorm)`, unique per user; plus RawEvent's `(deviceId, key, postedAt)` for exact repeats.
- **Claude fallback** (only when no template matches): `LlmProvider` interface; `AnthropicLlmProvider` uses the official SDK with structured output (JSON schema), `effort: low`, and server-side `fallbacks: "default"` so a classifier refusal is retried on the recommended model. Model `LLM_MODEL` (default `claude-opus-5`). The answer is validated again; the movement is always PENDING (confidence 0.70, origin LLM). The notification text is untrusted input: the schema constrains the answer and the user confirms it.
- **Cost control.** `LLM_DAILY_CAP` calls per user per Argentine day (default 30); every call writes `LlmUsage` (model, tokens, cost in micro-dollars, outcome) and never the text. Over the cap, or with no key configured (`LLM_PROVIDER=none`), the event stays UNRECOGNIZED.
- **Pendientes** suggestions (`findReviewPairs`, pure): own-transfer pairs (unclassified IN + OUT from another source, same amount, ≤ 30 min), possible duplicates of manual entries, and detected expenses to confirm. Answers reuse `status` and `isOwnTransfer` through `PATCH /transactions/:id`, so nothing extra is stored and a wrong guess never changes money by itself.

## Consequences

- Every template needs real samples first (CLAUDE.md). Tests of the engine use an explicitly synthetic source.
- Sending notification text to Anthropic must be in the in-app disclosure and the privacy policy (Play User Data policy, July 2026 update on third-party AI).
- UNRECOGNIZED events (30-day retention) are the backlog for new templates.
