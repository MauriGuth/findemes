# 013 — Forwarded email and bills ("Por pagar")

Date: 2026-10-14 · Status: accepted

## Context

ADR 011 moved email to Phase 3: users forward bank, card and service emails (never mailbox OAuth). From them come movements, card statements and bills that must show up in "Te quedan" and remind the user before they are due.

## Decisions

- **Provider: Postmark inbound.** It works without our own domain: each server has `hash@inbound.postmarkapp.com` and splits `hash+anything` into a mailbox hash, so every user gets `hash+<token>@inbound.postmarkapp.com` (`User.inboundToken`, 12 random characters, rotatable). Inbound is in the paid plan (about US$16.50/month); the free developer plan (100 emails/month) is enough to test. A domain of our own can point its MX to Postmark later without code changes. Cloudflare Email Workers was the free alternative but needs a domain on Cloudflare and a Worker to deploy and parse MIME.
- **Webhook** `POST /inbound/postmark`: basic auth (`INBOUND_WEBHOOK_USER`/`PASSWORD`, timing-safe), no throttling, a 40 MB JSON limit only for `/inbound/*` (100 kB elsewhere). Unknown recipients get 200 so Postmark does not retry. Idempotent by `MessageID`.
- **Store first, read after.** The webhook stores the email encrypted (`RawEvent` channel `EMAIL`, 30 days: sender, subject, text, up to 3 PDFs of 8 MB) and answers; Claude reads it in the background. FAILED emails retry after 5 minutes and stale RECEIVED ones (deploy, cap) after 10, on the user's next email. Shutdown waits for the reading in flight.
- **Gmail forwarding confirmation** (from `@google.com`) is stored without calling Claude, and the app shows its code and link so the user finishes the setup without looking for that email. One-time codes and PINs are dropped as with notifications.
- **Claude reads everything** (no templates for email yet): one structured answer per email, `movement` | `card_statement` | `bill` | `not_financial`, PDFs as documents, effort `medium`, its own cap (`EMAIL_LLM_DAILY_CAP`, 40) and timeout. Errors do not count toward the cap.
- **Movements from email** are always PENDING (`origin LLM`, no source). The same payment seen by a notification and an email within 24 hours becomes a "¿Es el mismo pago?" question in Pendientes (`crossChannelPairs`); against a manual entry the window is 24 hours too.
- **`Bill`** (new table): kind, issuer, amount, minimum, due date, status `PENDING` (detected) | `UNPAID` | `PAID` | `IGNORED`, optional commitment and payment. Dedup by `sha256(user|kind|issuer|amount|dueOn)`. PENDING and UNPAID both count as owed (ADR 007 amendment).
- **"Pagué"** links the movement that paid it (candidates: same amount ±$1, up to 45 days before the due date) or records a new one. It settles the commitment's month when the bill is linked to one, and is a statement payment for card statements, so nothing is counted twice.
- **Reminders** are local, like the daily one: the day before and the morning of each due date, at 10:00, under the same switch. Server push waits for Phase 5.

## Consequences

- Users configure a Gmail filter once (guide in the app). Gmail's app cannot do it; the web can.
- Password-protected PDFs (some banks use the DNI) cannot be read; those emails end as not financial until we see real samples and decide.
- Email text and PDFs reach Postmark and Anthropic: the privacy policy and the in-app text say so.
