# Phase 5 — manual test checklist (period, push, budgets, stats, lock)

**Before starting**

- Push on Android needs Firebase: create a Firebase project → add an Android app with package `ar.com.novasolutions.findemes` → download `google-services.json` → Project settings → Service accounts → generate a private key (FCM V1). Then in `apps/mobile`: `npx eas-cli@latest credentials` → Android → preview → Google Service Account Key for FCM V1 → upload the key. Put `google-services.json` in `apps/mobile/` (it is not a secret, but keep it out of the repo if you prefer: `android.googleServicesFile` in `app.config.ts` points to it).
- The deploy shows migration `20261015130000_phase5_budgets_payday`.
- **New APK needed** (fingerprint lock and push are native): run the `Mobile build` workflow (profile `preview`).

| #   | Step                                                                        | Expected                                                                                                                                     | OK  |
| --- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --- |
| 1   | Ajustes → Tu día de cobro → 5 → Guardar.                                    | Inicio says "hasta que cobrés (el 5)"; "Tu mes" shows the month that started on the 5th; movements before the 5th are in the previous month. |     |
| 2   | Back to day 1.                                                              | Everything as before (calendar month).                                                                                                       |     |
| 3   | Ajustes → Alertas al momento → on (accept the permission).                  | The switch stays on. With DB access: your Device has a `pushToken`.                                                                          |     |
| 4   | Close Findemes and pay with a whitelisted app.                              | Within a minute: "Gastaste $X en …". Tapping it opens Findemes (Pendientes if it needs confirming).                                          |     |
| 5   | Receive a transfer.                                                         | "Te entraron $X · ¿Es tu sueldo?…" opening Pendientes.                                                                                       |     |
| 6   | Tu mes → Presupuestos → Supermercado $100.000. Load $85.000 of supermarket. | The bar turns amber, push "Usaste el 80% de Supermercado" once.                                                                              |     |
| 7   | Load $20.000 more.                                                          | Red bar, "Te pasaste por $5.000", push "Te pasaste del presupuesto de Supermercado" once.                                                    |     |
| 8   | Tu mes → Tu mes en números.                                                 | Spent, daily average, vs last month at the same point, weekday, categories: check against your movements.                                    |     |
| 9   | Alertas al momento → off; pay again.                                        | No push.                                                                                                                                     |     |
| 10  | Ajustes → Bloqueo con huella → on (asks the fingerprint).                   | On. Close and open the app: it asks the fingerprint. Leave it in the background > 1 min: asks again; < 1 min: does not.                      |     |
| 11  | Cancel the fingerprint prompt.                                              | "Findemes está bloqueado" with "Desbloquear"; the PIN works as fallback.                                                                     |     |
