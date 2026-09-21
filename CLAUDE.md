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
