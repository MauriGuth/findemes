# Phase 6 — manual test checklist (iPhone)

**Before starting (needs the Apple Developer account)**

- developer.apple.com → enroll (US$99/year) with the Nova Solutions account. Then, once, from a computer: `cd apps/mobile && npx eas-cli@latest build --platform ios --profile preview` and let EAS create the certificate and provisioning profile (register the test iPhone when asked: `eas device:create`). Later builds can run from the `Mobile build` workflow with `platform: ios`.
- For TestFlight: App Store Connect → new app `ar.com.novasolutions.findemes`, then `npx eas-cli@latest build --platform ios --profile production` and `npx eas-cli@latest submit --platform ios`.

| #   | Step                                                                                                      | Expected                                                                                      | OK  |
| --- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --- |
| 1   | Install, log in, Ajustes → Atajos del iPhone → Generar mi clave.                                          | The key ("fdi_…") and the address appear, with the steps.                                     |     |
| 2   | Build the SMS automation as the screen says; receive (or send yourself) an SMS from the bank.             | Within seconds the movement is in Inicio or Pendientes. The automation shows no error.        |     |
| 3   | Build the Apple Pay automation; pay with Apple Pay.                                                       | A pending movement with the amount and merchant; credit unless the card's name says "débito". |     |
| 4   | An SMS with a verification code from the bank.                                                            | Nothing is stored (`ignored`).                                                                |     |
| 5   | Log out and in again; trigger the automation.                                                             | It fails (401) until you generate a new key and paste it in the automations.                  |     |
| 6   | Forwarded email (Phase 3), ticket photo and typed entry (Phase 4), budgets, payday and Face ID (Phase 5). | Same as on Android.                                                                           |     |
