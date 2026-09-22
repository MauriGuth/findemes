# ADR 006 — Auth: email OTP, short access JWT, rotating refresh families

**Status:** accepted · **Date:** 2026-09-22

## Context

The brief demands "TLS, short JWTs + rotating refresh, tokens in expo-secure-store" and full account deletion. There are no passwords: the user signs in with a 6-digit code sent to their email (signup is the first login). Argentina's Ley 25.326 and the store policies require a real deletion path and a privacy policy that names every processor.

## Decision

- **Passwordless OTP.** `POST /auth/request-code` creates a `LoginCode` (no FK to `User`: the user may not exist yet) and sends the code by mail through a `MailProvider` interface (`console` in development, `fake` in tests, `resend` in production via `fetch`, no SDK). The response is always `200 { ok: true }` so it never reveals whether an email is registered. Codes are `crypto.randomInt(0, 1e6)` zero-padded, 10-minute TTL, stored as `HMAC-SHA256(OTP_PEPPER, email + '\n' + code)` and compared with `timingSafeEqual`. Up to **3 live codes per email** (asking again does not invalidate the previous one, otherwise anyone could lock you out by requesting codes in your name).
- **Failure budget.** Each code allows 5 attempts, counted atomically with a conditional `updateMany` before comparing. Independently, 20 failed attempts per email per day → 429, whatever code is used. Sends are capped per email (5/hour, 10/day), per IP (5/min, 20/day through two named throttlers) and globally (`OTP_GLOBAL_DAILY_CAP`, default 100 = Resend's free tier). Two user-facing errors only: "Código incorrecto. Revisá el mail." and "Ese código ya no sirve. Pedí uno nuevo."
- **Access token.** JWT HS256, 15 minutes (`JWT_ACCESS_TTL_SECONDS`), payload `{ sub: userId, sid: familyId }`, `iss findemes-api`, `aud findemes-mobile`, no PII. `@nestjs/jwt` only, no passport.
- **Refresh token.** 32 random bytes (base64url), stored as SHA-256, 30 days (`REFRESH_TTL_DAYS`), grouped in a **family** created at login with an absolute cap of 180 days (`REFRESH_FAMILY_MAX_DAYS`). `POST /auth/refresh` claims the token with one conditional `updateMany` (`revokedAt: null, expiresAt > now`): exactly one of two concurrent refreshes wins. A token already revoked less than 60 s ago (`REFRESH_REUSE_GRACE_MS`) answers 401 without side effects (network retry); older reuse revokes the whole family and logs `refresh.reuse_detected`.
- **Session guard.** `JwtAuthGuard` verifies the JWT and then checks the family is alive (`refreshToken.findFirst({ familyId, revokedAt: null, expiresAt > now })`, indexed). Logout, detected reuse and account deletion invalidate the access token instantly; the cost is one indexed lookup, same as loading the user would be.
- **Devices.** `verify-code` accepts `device { id?, platform, appVersion?, name? }`; a known id owned by the user is updated, anything else creates a new `Device`. The app keeps the id in secure-store across logouts so one phone stays one row.
- **No development bypass.** In development the code is printed by `ConsoleMailProvider`; in tests `FakeMailProvider` exposes it; against Railway it arrives by Resend. The env schema refuses `console`/`fake` in production and refuses placeholder secrets outside development.
- **Deletion.** `DELETE /me` deletes the user (cascade to devices, tokens, transactions, plans, commitments) and the login codes of that email in one transaction; the app wipes secure-store, cancels local notifications and clears the query cache.
- **Logs** carry event names (`otp.requested`, `otp.verified`, `otp.failed`, `otp.rate_limited`, `otp.global_cap`, `refresh.rotated`, `refresh.reuse_detected`, `account.deleted`) with user and family ids; never the email, the code or amounts.

## Consequences

- Throttler counters live in memory: fine for one Railway container; a second replica needs a shared store (revisit with phase 5 scale).
- Resend's `onboarding@resend.dev` sender only delivers to the Resend account's own email until a domain is verified. Enough for the phase 1 DoD (one real user); phase 5 needs DNS.
- The privacy policy names Resend as a processor (30-day retention, servers outside Argentina).
- E2E tests replace `ThrottlerGuard` with a pass-through except in the one test that exercises 429 by IP.
