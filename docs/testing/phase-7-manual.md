# Phase 7 — beta checklist

**Before starting**

- Railway → API → Variables: `ADMIN_TOKEN` (`openssl rand -base64 48`) and `LEGAL_CONTACT_EMAIL` (the address users can write to). The deploy shows migration `20261015140000_phase7_activity_recurring`.
- Review `docs/privacy/privacy-policy.md` (it is what `/legal/privacy` publishes) and remove "borrador" when it is final.
- **New APK needed** (file export is native): `Mobile build` workflow, profile `preview`.

| #   | Step                                                                                                                 | Expected                                                                                                 | OK  |
| --- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --- |
| 1   | Open `https://findemesapi-production.up.railway.app/legal/privacy` in a browser.                                     | The policy, readable on the phone, with the contact address and a link to delete the account.            |     |
| 2   | `/legal/delete-account` with a test account: email → code → "Borrar mi cuenta para siempre".                         | "Listo: borramos tu cuenta…"; logging in with that email again starts from zero.                         |     |
| 3   | With 3+ months of a monthly payment (Netflix, gym): Tu mes.                                                          | "¿Son gastos fijos?" lists it. "Sumar como fijo" creates the commitment; "No es fijo" hides it for good. |     |
| 4   | Ajustes → Descargar mis movimientos → Últimos 3 meses → save to Drive and open with Sheets/Excel.                    | One row per movement, amounts with comma, accents fine, columns Fecha…Nota.                              |     |
| 5   | `curl -H "x-admin-token: $ADMIN_TOKEN" https://findemesapi-production.up.railway.app/admin/retention`.               | `weeklyActive` and `cohorts` with your usage.                                                            |     |
| 6   | Play Console: create the app, upload the `production` AAB to internal testing, fill data safety with the URLs above. | Testers can install from Play; the "Configuración restringida" step of Phase 2 disappears.               |     |
