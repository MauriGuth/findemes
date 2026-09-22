# ADR 008 — Daily reminder as local notifications, not push

**Status:** accepted · **Date:** 2026-09-22

## Context

The brief asks for a daily notification around 20:00: "Hoy: $X. Te quedan $Y para Z días". The number comes from `computeMonthSummary`, which the phone already computes/fetches. Server push would need Firebase (FCM credentials in EAS), a scheduler in the API and Expo Push, for a message the server cannot compute better than the phone in phase 1 (there is no automatic ingestion yet).

## Decision

- **Local notifications with `expo-notifications`.** `buildReminderSchedule(summary, today, time, now)` in `packages/shared` produces up to 8 one-shot entries (today if the time has not passed, then the next 7 days), each with the per-day budget recomputed for that day, stopping at the end of the month; the 1st of the next month gets "Empezó un mes nuevo. ¿Cuánto esperás cobrar?".
- **Resync everywhere the summary changes.** `syncDailyReminder` cancels every scheduled notification and schedules the fresh set. It runs whenever the summary query refetches (every mutation invalidates it), when the reminder time changes, and when the app returns to the foreground. Logout and account deletion cancel everything.
- **One channel, private.** Android channel `daily-summary` ("Resumen diario"), importance DEFAULT, `lockscreenVisibility: PRIVATE` so amounts are hidden on the lock screen. The channel is created before asking for permission (Android 13 shows no prompt without one) and every trigger sets `channelId` explicitly (otherwise it lands in "Miscellaneous" and PRIVATE does not apply).
- **Permission only on a user gesture**: the toggle in Ajustes or the card on Inicio, never at startup. Denied permanently → link to system settings.
- **No exact alarms.** `SCHEDULE_EXACT_ALARM` is not pre-granted on Android 13+ and `USE_EXACT_ALARM` is policy-restricted on Play. The copy says "cerca de las 20:00".
- **Staleness accepted.** If the app is not opened for a week, the reminders run out and stay silent, which beats a stale number.

## Consequences

- No Firebase, no `@nestjs/schedule`, no `expo-server-sdk`, no `expo-background-task` in phase 1.
- When phase 2 ingestion makes the server know more than the phone (a payment captured while the app is closed), revisit: either push with the fresh number or a background fetch that resyncs the local schedule.
- Notification text is built from the same shared function the app uses, so it can never disagree with the header.
