# ADR 009 — Device ingest token and native capture storage

**Status:** accepted · **Date:** 2026-09-23

## Context

Automatic capture (Phase 2) must upload notifications while the app is closed. The access JWT lasts 15 minutes and refresh tokens rotate with reuse detection (ADR 006): if the JS app and a native worker rotated the same refresh token, the slower one would reuse a revoked token and, after the 60-second grace window, kill the whole session.

## Decision

- **A separate, device-scoped credential.** `POST /devices/current/ingest-token` (session auth) issues `fdi_` + 32 random bytes for the device of the current session (`RefreshToken.deviceId`). Only `sha256` is stored (`Device.ingestTokenHash`, unique). It authorizes **only** `GET /ingest/config` and `POST /ingest/notifications` (`IngestAuthGuard`; the JWT guard is skipped there and the ingest token is refused everywhere else).
- **Lifetime.** Replaced on every issue. The app re-issues it when it opens and the token is older than `INGEST_TOKEN_ROTATE_DAYS` (30). The server refuses tokens older than twice that, so a lost phone stops uploading on its own. Revoked with the session on logout and on refresh-reuse detection (`TokenService.revokeFamily`), on `DELETE /devices/current/ingest-token`, and by cascade on account deletion.
- **Blast radius.** A stolen token can only add notifications to that user's account, which the whitelist and the parsers then filter. It cannot read anything.
- **On the phone.** The token and the API URL live in the module's own SharedPreferences, sealed with AES-256-GCM under a key generated in the Android Keystore (`SecretBox`). `androidx.security:security-crypto` is deprecated (1.1.0, July 2025) and Google recommends the Keystore directly. The upload queue is app-private SQLite with a 500-row cap; a 401 clears token and queue.
- **Transport.** The listener uploads right away from its own thread; WorkManager 2.11.2 (the only native dependency added) is the retry path with a network constraint and exponential backoff. Expedited work was rejected: on Android 12 and lower it requires a foreground service notification and extra manifest entries.
- **Manifest.** The module declares the `NotificationListenerService` (`BIND_NOTIFICATION_LISTENER_SERVICE`, not exported) in its own manifest; Gradle merges it, so no config plugin. WorkManager adds `WAKE_LOCK`, `ACCESS_NETWORK_STATE` and `FOREGROUND_SERVICE` (its `SystemForegroundService` has no type and is never started).

## Consequences

- Any new `/ingest/*` route must use `@IngestAuth()`.
- Sideloaded APKs on Android 13+ hit "restricted settings" when enabling notification access; the onboarding explains "Permitir configuración restringida". Play internal testing (Phase 5) removes that step.
- Samsung and other OEMs may put the app to sleep; `requestRebind` on disconnect plus the WorkManager retry cover the common cases. Revisit with a week of real use (DoD).
