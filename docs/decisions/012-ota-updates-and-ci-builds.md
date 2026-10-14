# 012 — OTA updates and builds from GitHub, no computer needed

Date: 2026-10-14 · Status: accepted

## Context

Mauricio asked to stop running commands on his Mac. With the dev client, every JS change needed `git pull`, `pnpm install` and Metro on the same Wi-Fi, and native changes needed `eas build` from his machine.

## Decision

- **`expo-updates`** with `runtimeVersion: { policy: 'fingerprint' }` and channels per profile (`development`, `preview`, `production`). An update only reaches builds with the same native fingerprint, so a JS bundle never runs on a binary it doesn't match.
- **Day-to-day app: the `preview` APK** (standalone, Railway API, `EXPO_PUBLIC_DEV_TOOLS=1` so capture mode stays available). The dev client stays for local development.
- **`Mobile OTA update` workflow**: after CI is green on `main`, publishes the bundle to the `preview` channel. The app downloads it on launch and applies it on the next launch.
- **`Mobile build` workflow** (manual): starts an EAS build of `preview` or `development` when native code changes; the APK link appears in the run log and on expo.dev.
- Both need the `EXPO_TOKEN` repository secret (an Expo access token Mauricio creates once). Without it the update workflow is a no-op.

## Consequences

- JS changes reach the phone minutes after a push, without a computer. Native changes still need one new APK install, started from GitHub.
- `expo-updates` is a new dependency (first-party Expo, versioned by the SDK).
