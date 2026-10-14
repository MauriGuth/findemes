# 011 — Product scope after Phase 2: email, bills, WhatsApp, payday period

Date: 2026-10-14 · Status: accepted (WhatsApp channel: open, decided when Phase 4 is planned)

## Context

Mauricio pointed at Lukas (lukas.jotatech.org) as the product reference: one home number ("podrías gastar $X por día"), AI entry by text, voice and photo, budgets, stats, scheduled payments, alerts. Findemes keeps its own edge (Android notifications read directly) and adds what Lukas lacks: everything the user has to pay, read from email. Lukas is offline-first; Findemes cannot be, because automatic reading needs the server.

## Decisions

1. **Phases re-planned** (CLAUDE.md is the source of truth): 3 email and bills, 4 receipts + WhatsApp + AI entry, 5 alerts and analysis, 6 iOS, 7 beta.
2. **Email by forwarding, never mailbox OAuth.** Each user gets a personal inbound address and sets up a Gmail/Outlook filter once. Reading Gmail through OAuth needs a restricted scope with a yearly third-party security assessment and would give us the whole mailbox; forwarding only gives us what the user routes to us. The inbound provider is chosen in Phase 3's plan.
3. **Bills ("Por pagar") are a new entity** linked to Commitments; its schema is proposed with Phase 3 (data-model change, approved before migrating).
4. **Budgets by category** move into the MVP, Phase 5.
5. **The period is "hasta que cobrés"**: the user's month runs from payday to payday instead of the calendar month. Lands in Phase 5 and supersedes the calendar-month part of ADR 007.
6. **Business apps are captured** (Galicia Office, BBVA Empresas, BPN Pagos): users with a company use them. Each app is its own `Source`, so no schema change. Telling personal from company money is a Phase 5 topic.
7. **WhatsApp**: a Findemes number that receives receipt photos, audio and text. Mauricio prefers not to go through Meta. The only channel without Meta is an unofficial WhatsApp Web client, which breaks WhatsApp's terms, can get the number banned without notice, and keeps the session keys of that number on our server. The official Cloud API needs a Meta business portfolio and the number, not necessarily a full business verification to start. Decided with Mauricio when Phase 4 is planned.
