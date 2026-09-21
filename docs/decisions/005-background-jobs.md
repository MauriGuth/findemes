# ADR 005 — Background jobs: decision deferred to phase 2

**Status:** proposed (decision in phase 2) · **Date:** 2026-09-21

## Context

Parsing notifications, extracting receipts with an LLM and processing inbound mail are asynchronous. The brief allows either BullMQ + Redis or synchronous processing with a jobs table if Redis complicates the MVP.

## Decision

- Phase 0 ships **Redis in `docker-compose.yml` only**. Nothing in the code uses it, Railway has no Redis service, and `bullmq` is not installed.
- Phase 2 (Android ingestion) decides with real numbers: notifications per user per day, LLM fallback rate, latency target (< 1 minute from payment to screen).
- Decision criteria: if the parsing step stays under a few hundred milliseconds and the LLM fallback is rare, **synchronous processing inside `POST /ingest/notifications` plus a `Job` table** for retries and the 30-day purge is enough and removes a paid service. If the LLM fallback or receipt extraction needs concurrency control, rate limiting per user and retries with backoff, **BullMQ 6 + `@nestjs/bullmq` 12** on a Railway Redis.

## Consequences

- The ingestion endpoint in phase 2 must be written so the processing step is a function that can be called inline or from a worker.
- This ADR is updated (not replaced) with the phase 2 decision.
