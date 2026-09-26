# CLAUDE.md — Findemes (nombre provisorio)

## Quién soy y cómo trabajamos
- Soy Mauricio (Nova Solutions SAS, Neuquén, Argentina). Stack de casa: TypeScript, NestJS, Next.js, Kotlin, n8n, Railway, Vercel.
- Vos sos el ingeniero senior del proyecto. Yo defino producto y pruebo en dispositivos reales.
- Idioma: hablame en español. Código, identificadores, commits y docs técnicos en inglés. Textos de UI en español rioplatense (es-AR, voseo: "Pagaste", "Te quedan").
- Trabajamos por fases (abajo). Nunca empieces una fase sin presentarme el plan y esperar mi OK. Dentro de una fase, avanzá sin pedir permiso salvo para: agregar dependencias fuera de la lista, cambiar el modelo de datos, tocar permisos/manifest, o decisiones de seguridad.
- Si te falta un dato (formato real de una notificación, package name, credencial), PREGUNTÁ. No inventes formatos de notificaciones bancarias ni package names: se validan con muestras reales que yo te paso.
- Registrá decisiones técnicas en docs/decisions/NNN-titulo.md (ADR corto). Mantené este CLAUDE.md actualizado cuando cambie algo estructural.

## El producto en una frase
App personal de plata para Argentina que registra automáticamente todo lo que pagás — leyendo las notificaciones de bancos y billeteras (Android) y las fotos de tickets — y responde una sola pregunta en la pantalla principal: "¿Cuánto me queda hasta el 1?"

### Por qué existe
- En Argentina no hay open banking utilizable; las apps de finanzas personales mueren porque hay que cargar todo a mano.
- Las notificaciones de bancos/billeteras ya contienen el dato: monto, comercio, fecha, medio de pago. Solo hay que capturarlas y parsearlas.
- El ticket agrega lo que la notificación no tiene: qué compraste (ítems) → categorización real y, a futuro, un mapa de precios comunitario (NO está en este MVP).

### Alcance del MVP
1. Ingesta automática Android: NotificationListenerService que captura SOLO notificaciones de apps en una whitelist (bancos/billeteras), las encola y las sube al backend.
2. Motor de parsing: reglas determinísticas por app (templates versionadas en DB, actualizables sin release) + fallback con LLM para lo que no matchea + dedup.
3. Tickets: foto → extracción estructurada con LLM con visión (comercio, CUIT, fecha, total, ítems) → vinculación con la transacción de la notificación si existe.
4. Dashboard "Hasta el 1": ingreso del mes, compromisos fijos (alquiler, servicios, cuotas, débitos), gastado hasta hoy, proyección → "Te quedan $X para Y días ($Z por día)".
5. iOS: la ingesta automática no es posible (iOS no permite leer notificaciones de otras apps). Canales iOS: (a) mail entrante — cada usuario tiene una dirección propia a la que reenvía los mails de sus bancos; (b) plantilla de Atajos (Shortcuts) que al recibir SMS/mail de un banco hace POST a la API; (c) carga rápida manual; (d) share extension (fase 4).
6. Fuera del MVP: mapa de precios comunitario, gastos compartidos, presupuestos por categoría, conversión de moneda (USD se registra pero no se convierte), web app.

### Usuario objetivo y reglas de dominio (Argentina)
- Persona de 20 a 45 años, sueldo mensual (cobra entre el 1 y el 5), varias billeteras y bancos, compras en cuotas, débitos automáticos, servicios que vencen.
- Moneda ARS con centavos; formato "$1.234,56". Nunca floats: Decimal(18,2) en DB, string en API.
- Medios: débito/transferencia/billetera salen de la plata HOY; tarjeta de crédito NO sale hoy: va al resumen y se paga el mes siguiente. El dashboard distingue "cash disponible hasta el 1" de "comprometido en el próximo resumen".
- Cuotas: "3 cuotas de $X" → un Commitment con cuotas restantes; cada mes impacta una.
- Ingresos: detectar acreditaciones; el usuario confirma cuál es "el sueldo".
- Transferencias entre cuentas propias no son gasto (dedup por monto + fecha + dirección opuesta).
- Inflación: comparar mes a mes es engañoso; en MVP solo mostramos nominal y lo aclaramos en UI.
- Apps a soportar primero (package names a VERIFICAR conmigo antes de fijarlos): Mercado Pago, Ualá, Brubank, Naranja X, MODO, Personal Pay, Lemon, Galicia, Santander, BBVA, Macro, BNA+, Cuenta DNI, BPN (Banco Provincia del Neuquén), ICBC, Prex.

## Stack (fijo; cambiarlo requiere ADR)
- Monorepo pnpm + Turborepo. TypeScript estricto en todo.
- apps/mobile: Expo (última SDK estable) con expo-router, dev client + EAS Build (hay módulos nativos, Expo Go no sirve). TanStack Query, Zustand, NativeWind, expo-secure-store, expo-camera / expo-image-picker, expo-notifications, expo-sqlite (caché offline mínimo). Módulos nativos con Expo Modules API: Kotlin (Android) y Swift (iOS).
- apps/api: NestJS + Prisma + PostgreSQL. Auth JWT (access + refresh rotativo), OpenAPI con @nestjs/swagger, validación con zod desde packages/shared, rate limiting, BullMQ + Redis para colas (parsing, OCR, mails). Si Redis complica el MVP, arrancá con procesamiento síncrono + tabla de jobs y dejalo en un ADR.
- packages/shared: tipos, schemas zod, motor de parsers (TS puro, sin dependencias de Node ni de RN, para correrlo en backend hoy y on-device mañana), utilidades de dinero y fechas (Intl es-AR, TZ America/Argentina/Buenos_Aires).
- LLM: Anthropic API (Claude) con tool use / JSON estricto para (a) extracción de tickets con visión, (b) fallback de parsing. Detrás de una interfaz LlmProvider. Regla: primero regex, LLM solo si no matchea; loggear costo por request; cap diario por usuario.
- Archivos (fotos de tickets): storage S3-compatible (Cloudflare R2 o el bucket que yo configure). Nunca en el filesystem del contenedor.
- Infra: Railway (api + Postgres + Redis), EAS para builds, GitHub Actions (lint, typecheck, test). Docker compose para Postgres/Redis local.
- Mail entrante (fase 4): Resend/Postmark inbound o Cloudflare Email Workers; elegí y justificá en ADR.

## Estructura del repo
    apps/
      mobile/            Expo app (expo-router)
        modules/
          notification-capture/   Expo Module Kotlin + config plugin
          share-intent/           (fase 4, Swift)
      api/               NestJS: modules auth, ingest, parsing, transactions, receipts, plans, insights
    packages/
      shared/            zod schemas, tipos, parsers + fixtures, money/date utils
      config/            eslint, tsconfig, prettier compartidos
    docs/
      decisions/         ADRs
      samples/           muestras reales anonimizadas de notificaciones/tickets
      privacy/           política de privacidad y textos de divulgación

## Modelo de datos (Prisma, punto de partida; proponé ajustes antes de migrar)
- User, Device (platform, pushToken, listenerEnabled)
- Source (name, kind bank|wallet|card, packageName, iosHints)
- RawEvent (userId, channel android_notification|ios_shortcut|email|receipt_photo|manual, packageName, payload jsonb cifrado, receivedAt, processedAt, status; se borra a los 30 días)
- Transaction (userId, sourceId, amount Decimal, currency, direction in|out, method debit|credit|transfer|cash|wallet, merchantRaw, merchantNorm, categoryId, occurredAt, capturedAt, status pending|confirmed|ignored, confidence, origin template|llm|manual, fingerprint unique, rawEventId, receiptId?)
- Receipt (imageKey, merchant, cuit, issuedAt, total, extraction jsonb, status) + ReceiptItem (name, qty, unitPrice, total, categoryId)
- Category (system + custom), MonthPlan (userId, month, expectedIncome), Commitment (kind rent|service|installment|subscription|debit, amount, dayOfMonth, installmentsLeft, sourceId?, active)
- ParserTemplate (sourceId, version, pattern, fieldMap, priority, active, samples)
- Fingerprint de dedup: hash(userId, sourceId, amount, occurredAt redondeado a 2 min, merchantNorm). Notificación + ticket del mismo pago se enlazan, no se duplican.

## Flujo Android (el corazón del producto)
1. Onboarding con divulgación prominente: qué leemos (solo notificaciones de la whitelist), qué NO (WhatsApp, etc.), cómo se procesa, cuándo se borra. Botón que abre Settings > Notification access. Google Play exige política de privacidad pública y declarar el uso en la ficha; como es la funcionalidad principal está permitido, pero hay que documentarlo.
2. Módulo `notification-capture` (Kotlin, Expo Modules API + config plugin que registra el Service en el manifest): filtra por packageName ∈ whitelist (llega del backend y se cachea), extrae title/text/bigText/subText/timestamp/key, descarta duplicados (mismo key en 60 s), encola en SQLite local y dispara un WorkManager job con backoff exponencial que hace POST /ingest/notifications en batch con el token del usuario (guardado en EncryptedSharedPreferences vía el módulo). Debe funcionar con la app cerrada. API JS: isEnabled(), openSettings(), setWhitelist(), setAuthToken(), getQueueStats(), y un "capture mode" de desarrollo que guarda muestras anonimizadas que yo apruebo para armar parsers.
3. Backend: POST /ingest/notifications → RawEvent (idempotente por deviceId + key + timestamp) → job de parsing → ParserEngine (templates activas por sourceId, por priority) → confidence ≥ 0.9 crea Transaction confirmed; 0.6–0.9 pending (el usuario confirma); sin match → fallback LLM con schema estricto, origin=llm; si tampoco → "sin reconocer" para que yo arme la template.
4. Parsers con fixtures reales en packages/shared/src/parsers/__fixtures__/<source>/*.txt + expected JSON. Cada parser nuevo entra con tests. Fixtures anonimizados: montos y comercios sí; nombres de personas, CBU y alias nunca; últimos 4 dígitos enmascarados.

## Flujo tickets
Foto (cámara o galería) → compresión on-device (máx 1600 px, JPEG 80) → upload con URL prefirmada → POST /receipts → job: Claude con visión devuelve JSON con schema (merchant, cuit?, issuedAt, total, paymentMethodHint, items[]) → normalización de comercio → matching contra Transactions del usuario (mismo total ± $1 y ± 48 h) → si matchea, enlaza y enriquece con ítems; si no, crea Transaction method=cash pending → el usuario confirma. Guardar la extracción cruda en Receipt.extraction para reprocesar cuando mejore el prompt.

## Dashboard "Hasta el 1"
- Header: "Te quedan $X hasta el 1 · $Z por día". X = ingreso del mes (confirmado o esperado) − compromisos fijos aún no pagados − gastos cash del mes. Aparte: "Próximo resumen de tarjeta: $C".
- Movimientos por día con chip de origen (ícono de la app), estado, y swipe para categorizar/ignorar.
- "Pendientes": lo que la app necesita que confirmes (¿esto es tu sueldo? ¿esta transferencia fue a vos mismo? ¿este ticket es de este pago?).
- Notificación diaria 20:00 (configurable): "Hoy: $X. Te quedan $Y para Z días".

## Seguridad y privacidad (no negociable)
- TLS, JWT cortos + refresh rotativo, tokens en expo-secure-store, columnas sensibles cifradas en reposo (RawEvent.payload, Receipt.extraction), RawEvent borrado a los 30 días, imágenes con URL firmada y expiración, borrado de cuenta completo desde la app (Play y App Store lo exigen).
- Whitelist estricta: nunca capturar notificaciones fuera de ella; nunca mensajería.
- Cumplir Ley 25.326 (Argentina): política de privacidad, finalidad, derecho de acceso y supresión.
- Nada de secretos en el repo: .env.example documentado; variables en Railway.
- Logs sin PII ni montos.

## Fases y Definition of Done
- Fase 0 — Cimientos: monorepo, api con healthcheck + Prisma + migración inicial + swagger, mobile con expo-router y pantalla placeholder, shared con money utils y schema de Transaction, docker compose, CI, deploy de api a Railway con migraciones automáticas. DoD: `pnpm dev` levanta todo; CI verde; README con setup en 10 minutos.
- Fase 1 — Loop manual: auth (email + código OTP), seed de Sources y Categories, alta manual de Transaction, MonthPlan + Commitments, dashboard con datos manuales, notificación diaria. DoD: puedo usar la app un mes cargando a mano y el número de arriba es correcto (tests de la fórmula: sueldo aún no cobrado, cuota, crédito vs débito, transferencia propia).
- Fase 2 — Ingesta Android: módulo nativo, onboarding de permisos, ingest endpoint, ParserEngine + templates para Mercado Pago, Ualá, Brubank, Galicia, Santander y BPN (yo paso muestras), fallback LLM, dedup, pantalla "Pendientes", capture mode. DoD: en mi teléfono, un pago real aparece en < 1 minuto sin abrir la app; 100% de fixtures pasan; cero duplicados en una semana de uso real.
- Fase 3 — Tickets: cámara, upload, extracción, matching, ítems, categorías desde ítems. DoD: 20 tickets reales con total correcto ≥ 90% y matching correcto cuando existe la notificación.
- Fase 4 — iOS: build iOS, mail entrante por usuario, plantilla de Atajos + endpoint, carga rápida, share extension. DoD: TestFlight funcionando; un mail de banco reenviado se convierte en Transaction.
- Fase 5 — Beta: detección de recurrentes (sugerir Commitments), cuotas, export CSV, pulido de UI y onboarding, políticas publicadas, closed testing en Play y TestFlight, analítica de retención (PostHog o similar). DoD: 30 usuarios reales y retención semanal medida.

## Convenciones
- Conventional commits, PRs chicos por feature, ramas feature/<fase>-<tema>.
- Tests obligatorios: parsers (golden fixtures) y fórmula del dashboard. E2E de API con DB de test. Maestro para 3 flujos críticos en mobile (opcional en MVP).
- Antes de decir "listo": lint, typecheck, tests, y probaste el flujo a mano (o me pedís que lo pruebe yo en el teléfono).
- Errores de usuario en español, claros y accionables. Cero jerga técnica en UI.
- Sin sobre-ingeniería: nada de microservicios, GraphQL ni DDD ceremonial. Módulos NestJS por dominio.

## Muestras reales
(vacío por ahora; las pego yo acá o en docs/samples/. Nunca inventes una muestra.)

## Fase 0 — estado (2026-09-21)

Cimientos hechos y verificados: monorepo, `shared` con tests, API con `/health`, migración `init`, Swagger, app Expo con pantalla placeholder, compose, CI y config de Railway. Setup en `README.md`. Decisiones en `docs/decisions/001` a `005`.

**Lo que quedó fijo** (cambiarlo requiere ADR):

- Node 22 · pnpm 10.33 (aislado, sin `hoisted`) · Turborepo 2.11 · TypeScript 6.0.3 (no 7) · ESLint 9 · Vitest 5.
- API: NestJS 12 **en ESM** (imports con `.js`), validación zod nativa con `StandardSchemaValidationPipe` y `@Body({ schema })`, sin `nestjs-zod`. Prisma 7.10 pinneado exacto (`latest` en npm es un RC de la 8), generator `prisma-client` a `src/generated/prisma` (gitignored), adapter `pg`.
- Mobile: Expo SDK 57 con las versiones que pinnea el SDK (`npx expo install --fix` manda). Identidad: `Findemes` / slug `findemes` / scheme `findemes` / `ar.com.novasolutions.findemes`. `eas init` lo corre Mauricio.
- `shared`: dinero como string decimal (`"1234.56"`) sobre big.js con redondeo half-even; formato `$1.234,56` a mano (sin Intl); calendario con UTC-3 fijo. Se compila con `tsc` a `dist` y **todos** (API y Metro) consumen `dist`.
- Redis: solo en docker compose; nada en Railway ni BullMQ en el código hasta la Fase 2 (ADR 005).
- Migración inicial: modelo completo (ver `apps/api/prisma/schema.prisma`; ajustes respecto al punto de partida en ADR 003 y en los comentarios del schema).
- Deploy: `apps/api/Dockerfile` con contexto en la raíz + `railway.json` en la raíz con `preDeployCommand: prisma migrate deploy`. Railway lo crea Mauricio desde el dashboard.

**Trampas conocidas**:

- SDK 57: `expo prebuild` borra `android/` e `ios/`. El módulo nativo de la Fase 2 vive en `apps/mobile/modules/` con un config plugin; nunca se editan esas carpetas a mano.
- pnpm aislado: si una lib de RN no resuelve una dependencia transitiva (pasó con `react-native-css-interop` de NativeWind y con `babel-preset-expo` en EAS Build), se declara directa en `apps/mobile/package.json`.
- `engine-strict` está apagado a propósito: dependencias del CLI de Nest pinnean el último patch de Node 22.
- Los enums de `packages/shared/src/schemas/enums.ts` y los de `schema.prisma` se comparan en un test: al agregar un valor, se agrega en los dos.

## Fase 1 — estado (2026-09-22)

Loop manual completo y verificado: login por código de mail, movimientos a mano, plan del mes y compromisos, header "Te quedan $X hasta el 1" desde `computeMonthSummary` (función pura con golden tests, ADR 007), recordatorio diario local (ADR 008). Auth en ADR 006. Checklist manual en `docs/testing/phase-1-manual.md`; borrador de privacidad en `docs/privacy/`.

**Lo que quedó fijo** (cambiarlo requiere ADR):

- Auth sin contraseña ni passport: OTP por mail (3 códigos vivos, 5 intentos por código, 20 fallos por mail y día), access JWT de 15 min `{ sub, sid }`, refresh opaco rotativo con familias (30 días, tope 180, reclamo atómico, gracia de 60 s). `JwtAuthGuard` valida la familia en cada request. Sin bypass de desarrollo: el código sale por `MAIL_PROVIDER=console`.
- Mail por `MailProvider` (`console` | `fake` | `resend` con `fetch`). Resend sin dominio verificado solo entrega al mail de la cuenta.
- Modelo: `LoginCode` y `RefreshToken`; `MonthPlan.salaryTransactionId` (sin `incomeConfirmed`); `Transaction.isOwnTransfer / commitmentId / commitmentMonth / isStatementPayment`; `Commitment.method / startsOn / endsOn` (sin contadores: la cuota N de M se deriva del calendario); `User.dailyReminderTime`. Migración `20260922010000_phase1_auth_and_planning`.
- Regla de fechas: columnas `@db.Date` solo con `dateColumnToIso`/`isoToDateColumn` (UTC); `toArtCalendarDate` solo para `timestamptz` y el reloj.
- Fórmula: `remaining = ingreso − gastos cash − compromisos cash impagos − resumen anterior impago`; OUT PENDING resta, IN PENDING no suma; vincular un pago no mueve `remaining`; `statement.next = crédito del mes + compromisos crédito impagos`.
- Ingresos se clasifican al cargar (Mi sueldo / Otro ingreso / Entre mis cuentas); un IN sin clasificar nace PENDING y es candidato a sueldo.
- Compra en cuotas con tarjeta = un `Commitment INSTALLMENT CREDIT`, sin transacción por el total (`POST /transactions/installments`).
- "Pagué" = `POST /commitments/:id/payments` (409 si ya está saldado ese mes); pagos parciales por `POST /transactions` con `commitmentId`.
- Seed idempotente (`node dist/seed.js`) en el `preDeployCommand` de Railway y en CI después del build. 16 Sources sin `packageName` (se fijan en Fase 2 con muestras reales) y 16 categorías de sistema.
- Mobile: `Stack.Protected` con zustand + expo-secure-store; `apiRequest` con refresh single-flight; tabs Inicio · Tu mes · Ajustes; recordatorio con canal `daily-summary` PRIVATE, permiso solo al prender el toggle, sin `SCHEDULE_EXACT_ALARM`; `eas.json` `development` y `preview` apuntan a Railway; para iterar se usa el dev client + `pnpm dev:railway` (Metro en la Mac) y se rebuildea solo si cambia algo nativo.
- Deploy: Railway con `railway.json` como config-as-code (sin build/start command custom en el dashboard, un solo servicio para la API). Nada en Vercel.

**Trampas conocidas**:

- `prisma migrate dev` no corre sin TTY: la migración se genera con `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` y se aplica con `migrate deploy`.
- Los e2e reemplazan `ThrottlerGuard` (registrado como provider + `APP_GUARD useExisting`) salvo en el test de 429; los mails de test terminan en `@e2e.findemes.test` y se purgan en `cleanupE2eData`.
- Las rutas tipadas de expo-router (`.expo/types/router.d.ts`) solo se regeneran con `expo start`; `expo export` no las toca. Para matar Metro usar `pkill -f "expo [s]tart"`.
- Un grupo de expo-router sin `index` abre la primera ruta en orden alfabético: `(auth)` y `(app)` declaran `unstable_settings.initialRouteName` en su `_layout`.
- `eslint-config-expo` 57 prohíbe `setState` sincrónico dentro de `useEffect`: usar `key` para reiniciar estado local desde el servidor.
- EAS bundlea desde un checkout limpio: `shared/dist` no existe hasta que corre el hook `eas-build-post-install` de `apps/mobile`. Sin ese hook el build falla en "Bundle JavaScript".
- Railway: si un deploy no muestra el paso **Pre-deploy**, las migraciones no corrieron (pasó en el primer deploy: `/health` verde y todo lo demás en 500). Revisar Settings → Deploy → Pre-deploy Command.
- Los montos se tipean con `MoneyInput`, que formatea en vivo con `formatTypedAmount` de `shared` ("3.000.000", coma para centavos); no usar `TextField` para plata.
- El pago del resumen se crea con `isStatementPayment` y el monto pendiente; no vincularlo a un compromiso.

## Fase 2 — estado (2026-09-23)

Todo lo que no depende de muestras está hecho y verificado localmente: módulo nativo `notification-capture` (Kotlin), token de ingesta por dispositivo (ADR 009), `/ingest/config` y `/ingest/notifications`, RawEvent cifrado, `ParserEngine` en `shared`, fallback con Claude y tope diario (ADR 010), dedup por fingerprint, Pendientes (detectados, transferencias propias, duplicados de lo cargado a mano), onboarding con divulgación y modo captura. ADR 005 cerrado: procesamiento sincrónico, sin Redis ni BullMQ. Checklist manual en `docs/testing/phase-2-manual.md`.

**Whitelist (2026-09-26)**: `packageName` verificado contra Play Store (título y desarrollador) para Mercado Pago (`com.mercadopago.wallet`), Ualá (`ar.com.bancar.uala`), Brubank (`com.brubank`), Santander (`ar.com.santander.rio.mbanking`), BBVA (`com.bbva.nxt_argentina`) y Prex (`air.PrexArgentina`). Solo apps de personas: las de empresas (BBVA Empresas, Galicia Office) quedan afuera. `catalog.data.spec.ts` impide package names mal formados, repetidos o de mensajería.

**Falta (bloqueado por Mauricio)**: package name de Galicia (personas) y BPN, y muestras reales de cada app → un commit `feat(parsers): <source>` por app con fixtures reales. Hasta entonces `TEMPLATE_DEFINITIONS` está vacío y todo lo capturado pasa por Claude (queda PENDING).

**Lo que quedó fijo** (cambiarlo requiere ADR):

- El módulo nativo se autentica con un token de ingesta (`fdi_` + 32 bytes, sha256 en `Device.ingestTokenHash`) que solo sirve para `/ingest/*` (decorador `IngestAuth`). Se revoca al apagar la captura, al cerrar sesión (`revokeFamily`) y al borrar la cuenta; se rota al abrir la app pasados 30 días y vence a los 60.
- `RawEvent.payload`: AES-256-GCM con `RAW_EVENT_KEY` (AAD `raw-event:<userId>`), `keyVersion` para rotar. Sin la clave, la ingesta responde 503. Vence a los 30 días; la purga es oportunista en cada ingesta.
- Procesamiento sincrónico en la request. Un evento `FAILED` se reintenta en una subida posterior de cualquier dispositivo del usuario, pasados 5 minutos (`RETRY_BACKOFF_MS`), hasta 5 por subida y solo de las últimas 24 h.
- La app actualiza la whitelist nativa en cada apertura con `GET /devices/current/ingest-config` (JWT); el módulo por su cuenta solo la refresca cada 6 h y nunca con la lista vacía.
- Templates como código en `packages/shared/src/parsers/templates/`, sincronizadas a `ParserTemplate` por el seed (nueva `version` si cambia algo). Regex con grupos con nombre (`amount`, `merchant`, …). Confianza ≥ 0,90 → CONFIRMED; menos → PENDING. Los IN nacen siempre PENDING.
- LLM: `LlmProvider` (`anthropic` | `fake` | `none`), modelo por `LLM_MODEL` (default `claude-opus-5`, effort `low`, salida con JSON schema). Confianza fija 0,70 → siempre PENDING. Tope `LLM_DAILY_CAP` por usuario y día (las llamadas con error no cuentan); cada llamada escribe `LlmUsage` con tokens y costo, sin texto ni montos.
- Fingerprint: `sha256(userId|sourceId|amount|occurredAt en buckets de 2 min|merchantNorm)`; si choca, el evento queda PROCESSED como duplicado.
- Pendientes: `findReviewPairs` en `shared` (transferencia propia OUT/IN ≤ 30 min en fuentes distintas; duplicado de uno manual ≤ 10 min). Se resuelven con los campos que ya existían (`status`, `isOwnTransfer`) por `PATCH /transactions/:id`.
- Nativo: `NotificationListenerService` que descarta fuera de la whitelist antes de leer el contenido, cola SQLite (tope 500), token cifrado con Android Keystore (AES-GCM), subida directa y `WorkManager` 2.11.2 para reintentos. Única dependencia nativa nueva.

**Trampas conocidas**:

- Cambios en `modules/notification-capture` requieren rebuild del dev client (`--profile development`); cambios de JS no.
- Metro consume `shared/dist`: después de un `git pull` que toca `shared`, un Metro viejo o un `dist` desactualizado dejan al dev client en "Unable to load script". `pnpm dev:railway` ahora compila `shared` antes de arrancar; si persiste, `pnpm dev:railway --clear` y mismo Wi-Fi que la Mac.
- Android 13+ con APK fuera de Play: el acceso a notificaciones aparece como "Configuración restringida" hasta habilitarlo desde la info de la app. La app lo explica.
- "Forzar detención" desengancha el listener hasta abrir la app; deslizarla de recientes no.
- `fieldMap` es `jsonb`: Postgres reordena las claves, así que el seed compara con `stableJson`; sin eso, cada deploy publicaba una versión nueva de cada template.
- `pkill -f "expo [s]tart"` en la misma línea que otros comandos mata la propia shell (exit 144): correrlo solo.
- Maven Central devuelve 429 a veces al compilar el Kotlin localmente: reintentar.
- Nunca inventar un fixture de banco: los tests del motor usan una fuente sintética y los e2e templates `E2E …`; `__fixtures__/<source>/` es solo para muestras reales anonimizadas.
