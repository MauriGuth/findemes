# 014 — Ticket photos, AI entries and chats (Telegram, WhatsApp)

Date: 2026-10-14 · Status: accepted (decisions delegated by Mauricio: "completá todo el plan")

## Context

ADR 011 scoped Phase 4: ticket photos (in the app or by chat), extraction with Claude vision, matching with the notification's movement, and loading expenses by text or audio, in the app and by WhatsApp. Mauricio asked to build everything now and add credentials and accounts later, so every external service is optional and the app says "todavía no está disponible" until it is configured.

## Decisions

- **Storage: any S3-compatible bucket** (Cloudflare R2 recommended: free egress, 10 GB free). Configured with `S3_*`; all or none. Presigned URLs signed with AWS SigV4 by hand (`storage/sigv4.ts`, tested against AWS's reference vector) instead of `@aws-sdk/*`, which would add a large dependency for one signing routine. Path-style URLs work on R2, MinIO and AWS. The phone uploads with a 10-minute PUT URL; the API reads and deletes with 5-minute URLs; the app shows the photo with a 15-minute GET URL. Nothing touches the container's disk.
- **Photos on the phone**: `expo-image-picker` (camera or gallery, no microphone permission) and `expo-image-manipulator` (≤ 1600 px, JPEG 80), both pinned by the SDK. New native code: needs an APK rebuild.
- **Reading**: `POST /receipts {key}` registers the photo and Claude reads it in the background (vision, effort `medium`, JSON schema with item categories restricted to the system slugs). The raw extraction is stored encrypted (`Receipt.extractionEnc`, same key as RawEvent) to reprocess later. Invalid totals, dates more than 90 days old or in the future, CUITs that are not 11 digits are dropped. Failures say why in Spanish and can be retried.
- **Matching** (`pickReceiptMatch` in `shared`): an expense not ignored, without a ticket, same currency, within $1 and 48 h of the ticket's time (or the upload time); closest amount first, then closest time. A match is linked and enriched (category from the item with the largest share, merchant if missing) without touching its status or amount. No match → a PENDING movement (`origin LLM`, method from the ticket or cash, fingerprint `receipt:<id>`), confirmed in Pendientes like any detected expense.
- **Notification after the photo**: the ingest processor merges a notification into a ticket's pending movement (same rule) instead of creating a second one; the movement takes the notification's source, method, time and status. "Notificación + ticket del mismo pago se enlazan, no se duplican."
- **AI entries**: `POST /entries/parse` returns drafts (amount, currency, direction, method, merchant, category, date) and saves nothing; the app shows them for review and `POST /entries` saves them as manual movements (expenses confirmed, incomes waiting for classification, as in Phase 1). Slang ("lucas", "palo") is in the prompt. Audio in the app is the keyboard's dictation: no audio upload, no transcription service.
- **One shared daily cap** for tickets and entries (`ASSIST_LLM_DAILY_CAP`, 40; purposes `receipt` and `entry`), apart from notifications and email. Errors do not count.
- **Chats, not only WhatsApp.** A channel-agnostic core (`ChatService`) with two official adapters:
  - **Telegram Bot API**: free, a bot from @BotFather, no business verification. The webhook is registered on boot when `API_PUBLIC_URL` is set and checked with `X-Telegram-Bot-Api-Secret-Token`. Private chats only.
  - **WhatsApp Business Cloud API** (Meta): the only way to receive WhatsApp messages without breaking WhatsApp's terms. Mauricio preferred to skip Meta's setup; it stays implemented and off until he decides. Unofficial libraries that drive a personal WhatsApp (whatsapp-web.js, Baileys) are excluded: they violate the terms, numbers get banned, and they need a persistent browser session that does not fit Railway. Signature `X-Hub-Signature-256` checked on the raw bytes.
- **Linking**: the app shows a single-use code (8 characters without ambiguous ones, 30 minutes; `User.chatLinkCode`) as a Telegram deep link (`t.me/<bot>?start=<code>`) or a WhatsApp message (`vincular <code>`). A chat that sends 5 wrong codes is ignored for an hour. `ChatLink(userId, channel, externalId)`: one chat per channel and account; unlink from the app or by writing "desvincular". Messages from unlinked chats only get the instructions.
- **In the chat**: a photo becomes a receipt and the reply says what was recorded; text is parsed and saved right away (the user wrote it on purpose) with a reply listing what was saved; audio gets "por ahora no escucho audios". Webhooks answer 200 at once and the reply is sent after, so a slow ticket never makes the provider retry; redeliveries are dropped by message id (in memory: one API instance).
- **`GET /features`** tells the app which of tickets, AI entries, Telegram and WhatsApp are configured, so it hides or explains what is missing.

## Consequences

- To turn it on: an R2 bucket and its keys (`S3_*`), a Telegram bot (`TELEGRAM_*`, `API_PUBLIC_URL`) and, if wanted, a Meta app with a WhatsApp number (`WHATSAPP_*`). `ANTHROPIC_API_KEY` is already set.
- Photos and chat texts reach Anthropic; chat messages also pass through Telegram or Meta. The privacy texts say so.
- Deleting a ticket deletes its photo and the movement it created if still unconfirmed; deleting the account deletes every photo from the bucket.
- With more than one API instance, chat dedup would need a table; not needed on Railway's single instance.
