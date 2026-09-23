# ADR 005 — Background jobs

**Status:** accepted (decided in phase 2, 2026-09-23) · **Date:** 2026-09-21

## Context

Parsing notifications, extracting receipts with an LLM and processing inbound mail are asynchronous. The brief allows either BullMQ + Redis or synchronous processing with a jobs table if Redis complicates the MVP.

## Decision

- Phase 0 ships **Redis in `docker-compose.yml` only**. Nothing in the code uses it, Railway has no Redis service, and `bullmq` is not installed.
- Phase 2 (Android ingestion) decides with real numbers: notifications per user per day, LLM fallback rate, latency target (< 1 minute from payment to screen).
- Decision criteria: if the parsing step stays under a few hundred milliseconds and the LLM fallback is rare, **synchronous processing inside `POST /ingest/notifications` plus a `Job` table** for retries and the 30-day purge is enough and removes a paid service. If the LLM fallback or receipt extraction needs concurrency control, rate limiting per user and retries with backoff, **BullMQ 6 + `@nestjs/bullmq` 12** on a Railway Redis.

## Consequences

- The ingestion endpoint in phase 2 must be written so the processing step is a function that can be called inline or from a worker.
- This ADR is updated (not replaced) with the phase 2 decision.

## Phase 2 decision (2026-09-23)

**Synchronous processing, no Redis.** `POST /ingest/notifications` stores each notification and runs `IngestProcessor.process()` in the same request: templates take milliseconds and the Claude fallback is rare, capped per user and bounded by `LLM_TIMEOUT_MS` (15 s). There is no `Job` table either: `RawEvent.status` is the job state. A FAILED event is retried on the next upload of the same user (up to five per upload, from the last day), and expired events are purged on every upload (`expiresAt` index). The processor has no HTTP dependency, so moving it to BullMQ later changes the caller, not the logic. Revisit when receipts (Phase 3) need vision calls that take longer than a request should.
