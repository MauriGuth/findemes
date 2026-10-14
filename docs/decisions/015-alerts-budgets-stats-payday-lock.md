# 015 — Push alerts, budgets, statistics, payday period and fingerprint lock

Date: 2026-10-14 · Status: accepted (delegated by Mauricio: "completá todo el plan")

## Context

ADR 011 scoped Phase 5: server push (detected spending, incomes, due dates, budgets), budgets by category, statistics (daily average, top category, weekday, vs previous month), the "hasta que cobrés" period, and a fingerprint lock. The DoD was to be defined when planning; it is set below.

## Decisions

- **Period**: see the ADR 007 amendment. `User.payday` 1..28, default 1; changing it only changes how months are cut, no data migrates.
- **Push through Expo's push service** (`exp.host`), not FCM directly: one HTTPS call, no server credentials (`EXPO_ACCESS_TOKEN` only if "enhanced security" is turned on). Android delivery needs the FCM V1 key uploaded to the EAS project (`eas credentials`), which is Mauricio's to do; until then the phone gets no token and nothing is sent. `PUSH_PROVIDER` = `expo` (default) | `fake` (tests) | `none`.
- **What is pushed**: a movement detected without opening the app (notification or email) — "Gastaste $X en Y" or "Te entraron $X" (asks to classify); a budget reaching 80% and 100%, once per period each (`Budget.alertedMonth/alertedLevel`). Due dates stay local (ADR 013), so they work without push. Tickets and typed entries do not push (the user is in the app or the chat answered). Android channel `alerts`, PRIVATE on the lock screen (amounts hidden there). `User.pushAlerts` turns everything off; the permission is asked only from that toggle. Tokens that Expo reports as unregistered are dropped; a token moves with the phone between accounts.
- **Budgets**: one per category (`Budget`, unique by user + category), spent is always computed (`computeBudgets` in shared): ARS expenses not ignored, not own transfers, not statement payments, cash and credit alike, pending included. Changing the amount re-arms the alerts.
- **Statistics** (`computeStats` in shared, `GET /insights/stats`): spent in the period up to today, daily average over elapsed days, by category with shares, the weekday with most spending, and the previous period over the same number of days. Nominal; the screen says comparisons are distorted by inflation.
- **Fingerprint lock**: `expo-local-authentication`, local only (a flag in SecureStore, nothing on the server). Asks on open and after a minute in the background; the phone PIN works as fallback; turning it on requires a successful unlock first. New native dependency → APK rebuild.

## Definition of Done (Phase 5)

1. With payday 5, the header says "hasta que cobrés (el 5)" and the number matches a hand calculation over a real week crossing the 1st.
2. A real payment captured with the app closed produces a push within a minute (once FCM is configured).
3. A budget at 80% pushes once; at 100% once more; nothing else that period.
4. The analysis screen's numbers match a manual sum for the current month.
5. The fingerprint lock blocks the app after a minute away.

## Consequences

- Push content (amounts, merchants) passes through Expo and Google (FCM). The privacy texts say so.
- `statement.next` still follows the period, not the card's real closing date (cards from real statements arrive by email since Phase 3).
