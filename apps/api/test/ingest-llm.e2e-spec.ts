import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type FakeLlmProvider } from '../src/llm/fake-llm.provider.js';
import { RETRY_BACKOFF_MS } from '../src/ingest/ingest.service.js';
import { LLM_PROVIDER } from '../src/llm/llm.provider.js';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs } from './helpers/auth.js';
import { cleanupE2eData } from './helpers/db.js';
import { createE2eSource, type E2eSource } from './helpers/ingest.js';

// Synthetic texts only; the LLM is the in-process fake.
describe('ingest LLM fallback (e2e)', () => {
  let ctx: TestApp;
  let source: E2eSource;
  let llm: FakeLlmProvider;
  let keyCounter = 0;

  beforeAll(async () => {
    ctx = await createTestApp();
    ctx.clock.set(new Date('2026-09-23T15:00:00Z'));
    source = await createE2eSource(ctx.prisma);
    llm = ctx.app.get<FakeLlmProvider>(LLM_PROVIDER);
  });

  beforeEach(() => llm.reset());

  afterAll(async () => {
    await cleanupE2eData(ctx.prisma);
    await ctx.close();
  });

  const api = () => request(ctx.app.getHttpServer());

  async function setup() {
    const session = await loginAs(ctx);
    const res = await api().post('/devices/current/ingest-token').set(session.auth).expect(201);
    return { session, ingest: { Authorization: `Bearer ${res.body.token as string}` } };
  }

  const item = (text: string) => {
    keyCounter += 1;
    return {
      key: `llm|${String(keyCounter)}`,
      packageName: source.packageName,
      postedAt: ctx.clock.now().toISOString(),
      text,
    };
  };

  const send = (auth: { Authorization: string }, text: string) =>
    api()
      .post('/ingest/notifications')
      .set(auth)
      .send({ items: [item(text)] })
      .expect(200);

  it('asks Claude when no template matches and always leaves the result PENDING', async () => {
    const { session, ingest } = await setup();
    llm.respondWith(() => ({
      isFinancial: true,
      amount: '2.500,50',
      currency: 'ARS',
      direction: 'OUT',
      method: 'WALLET',
      merchant: 'Verdulería Suc. 3',
    }));

    await send(ingest, 'E2E formato nuevo que ninguna template conoce');

    expect(llm.calls).toEqual([
      { sourceName: 'E2E Bank', text: 'E2E formato nuevo que ninguna template conoce' },
    ]);
    const tx = await ctx.prisma.transaction.findFirstOrThrow({ where: { userId: session.userId } });
    expect(tx).toMatchObject({ origin: 'LLM', status: 'PENDING', merchantNorm: 'VERDULERIA' });
    expect(tx.amount.toFixed(2)).toBe('2500.50');
    expect(tx.confidence.toNumber()).toBe(0.7);

    const usage = await ctx.prisma.llmUsage.findFirstOrThrow({ where: { userId: session.userId } });
    expect(usage).toMatchObject({
      purpose: 'notification_fallback',
      outcome: 'parsed',
      inputTokens: 100,
      outputTokens: 40,
    });
    // Fake model is unpriced, so it is billed at the highest row: 100×10 + 40×50.
    expect(usage.costMicros).toBe(3000);
  });

  it('does not call Claude when a template matches', async () => {
    await (async () => {
      const { ingest } = await setup();
      await send(ingest, 'E2E GASTO $10 EN X');
    })();
    expect(llm.calls).toHaveLength(0);
  });

  it('leaves non-financial and unusable answers UNRECOGNIZED', async () => {
    const { session, ingest } = await setup();
    await send(ingest, 'E2E promo');
    llm.respondWith(() => ({
      isFinancial: true,
      amount: 'mucho',
      currency: 'ARS',
      direction: 'OUT',
      method: 'DEBIT',
      merchant: null,
    }));
    await send(ingest, 'E2E monto raro');

    const events = await ctx.prisma.rawEvent.findMany({ where: { userId: session.userId } });
    expect(events.map((e) => [e.status, e.error])).toEqual([
      ['UNRECOGNIZED', 'not_financial'],
      ['UNRECOGNIZED', 'not_financial'],
    ]);
    expect(await ctx.prisma.transaction.count({ where: { userId: session.userId } })).toBe(0);
  });

  it('respects the daily cap without calling Claude', async () => {
    const { session, ingest } = await setup();
    await ctx.prisma.llmUsage.createMany({
      data: Array.from({ length: 30 }, () => ({
        userId: session.userId,
        purpose: 'notification_fallback',
        model: 'x',
        inputTokens: 0,
        outputTokens: 0,
        costMicros: 0,
        outcome: 'parsed',
        createdAt: ctx.clock.now(),
      })),
    });
    await send(ingest, 'E2E sin template');

    expect(llm.calls).toHaveLength(0);
    const event = await ctx.prisma.rawEvent.findFirstOrThrow({ where: { userId: session.userId } });
    expect([event.status, event.error]).toEqual(['UNRECOGNIZED', 'llm_cap']);
  });

  it('marks errors FAILED and retries them on a later upload, after the backoff', async () => {
    const { session, ingest } = await setup();
    llm.respondWith(() => new Error('timeout'));
    const first = item('E2E falla la primera vez');
    await api()
      .post('/ingest/notifications')
      .set(ingest)
      .send({ items: [first] })
      .expect(200);
    const failed = await ctx.prisma.rawEvent.findFirstOrThrow({
      where: { userId: session.userId },
    });
    expect(failed.status).toBe('FAILED');

    // The phone resends the same batch right away (its read timed out): no second call.
    await api()
      .post('/ingest/notifications')
      .set(ingest)
      .send({ items: [first] })
      .expect(200);
    await send(ingest, 'E2E GASTO $1 EN Antes');
    expect(llm.calls).toHaveLength(1);
    expect((await ctx.prisma.rawEvent.findUniqueOrThrow({ where: { id: failed.id } })).status).toBe(
      'FAILED',
    );

    ctx.clock.advance(RETRY_BACKOFF_MS + 1_000);
    llm.respondWith(() => ({
      isFinancial: true,
      amount: '99',
      currency: 'ARS',
      direction: 'OUT',
      method: 'DEBIT',
      merchant: 'Reintento',
    }));
    await send(ingest, 'E2E GASTO $1 EN Otro');

    const retried = await ctx.prisma.rawEvent.findUniqueOrThrow({ where: { id: failed.id } });
    expect(retried.status).toBe('PROCESSED');
    const usage = await ctx.prisma.llmUsage.findMany({
      where: { userId: session.userId },
      orderBy: { createdAt: 'asc' },
    });
    expect(usage.map((u) => u.outcome).sort()).toEqual(['error', 'parsed']);
  });

  it('does not count failed calls toward the daily cap', async () => {
    const { session, ingest } = await setup();
    await ctx.prisma.llmUsage.createMany({
      data: Array.from({ length: 30 }, () => ({
        userId: session.userId,
        purpose: 'notification_fallback',
        model: 'x',
        inputTokens: 0,
        outputTokens: 0,
        costMicros: 0,
        outcome: 'error',
        createdAt: ctx.clock.now(),
      })),
    });
    llm.respondWith(() => ({
      isFinancial: true,
      amount: '1.500',
      currency: 'ARS',
      direction: 'OUT',
      method: 'DEBIT',
      merchant: 'Despues del corte',
    }));
    await send(ingest, 'E2E después de una caída');

    expect(llm.calls).toHaveLength(1);
    const event = await ctx.prisma.rawEvent.findFirstOrThrow({ where: { userId: session.userId } });
    expect(event.status).toBe('PROCESSED');
  });
});
