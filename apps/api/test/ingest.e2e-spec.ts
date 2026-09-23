import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type TestSession } from './helpers/auth.js';
import { cleanupE2eData } from './helpers/db.js';
import { createE2eSource, type E2eSource } from './helpers/ingest.js';

// Synthetic texts only (see helpers/ingest.ts).
describe('ingest (e2e)', () => {
  let ctx: TestApp;
  let source: E2eSource;
  let keyCounter = 0;

  beforeAll(async () => {
    ctx = await createTestApp();
    ctx.clock.set(new Date('2026-09-23T15:00:00Z'));
    source = await createE2eSource(ctx.prisma);
  });

  afterAll(async () => {
    await cleanupE2eData(ctx.prisma);
    await ctx.close();
  });

  const api = () => request(ctx.app.getHttpServer());

  async function enable(session: TestSession): Promise<{ Authorization: string }> {
    const res = await api().post('/devices/current/ingest-token').set(session.auth).expect(201);
    expect(res.body.token).toMatch(/^fdi_/);
    return { Authorization: `Bearer ${res.body.token as string}` };
  }

  function item(text: string, overrides: Record<string, unknown> = {}) {
    keyCounter += 1;
    return {
      key: `0|${source.packageName}|${String(keyCounter)}|null|10001`,
      packageName: source.packageName,
      postedAt: ctx.clock.now().toISOString(),
      title: null,
      text,
      ...overrides,
    };
  }

  const send = (auth: { Authorization: string }, items: object[]) =>
    api().post('/ingest/notifications').set(auth).send({ items }).expect(200);

  it('the ingest token only opens /ingest/* and the session token does not open it', async () => {
    const session = await loginAs(ctx);
    const ingest = await enable(session);

    const config = await api().get('/ingest/config').set(ingest).expect(200);
    expect(config.body.packages).toContain(source.packageName);
    await api().get('/me').set(ingest).expect(401);
    await api().get('/ingest/config').set(session.auth).expect(401);
    await api().get('/ingest/config').expect(401);

    const device = await ctx.prisma.device.findUniqueOrThrow({ where: { id: session.deviceId } });
    expect(device.listenerEnabled).toBe(true);
    expect(device.lastIngestAt).not.toBeNull();
  });

  it('stores whitelisted notifications encrypted and drops everything else', async () => {
    const session = await loginAs(ctx);
    const ingest = await enable(session);

    const res = await send(ingest, [
      item('E2E GASTO $1.234,56 EN Kiosco Pepito'),
      item('mensaje privado', { packageName: 'com.whatsapp' }),
    ]);
    expect(res.body).toEqual({ accepted: 1, duplicates: 0, rejected: 1 });

    const events = await ctx.prisma.rawEvent.findMany({ where: { userId: session.userId } });
    expect(events).toHaveLength(1);
    expect(events[0]?.packageName).toBe(source.packageName);
    expect(Buffer.from(events[0]?.payloadEnc ?? []).toString('utf8')).not.toContain('Kiosco');

    const txs = await ctx.prisma.transaction.findMany({ where: { userId: session.userId } });
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({
      sourceId: source.id,
      direction: 'OUT',
      method: 'DEBIT',
      status: 'CONFIRMED',
      origin: 'TEMPLATE',
      merchantNorm: 'KIOSCO PEPITO',
      rawEventId: events[0]?.id,
    });
    expect(txs[0]?.amount.toFixed(2)).toBe('1234.56');
    expect(txs[0]?.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never creates the same movement twice', async () => {
    const session = await loginAs(ctx);
    const ingest = await enable(session);
    const first = item('E2E GASTO $500 EN Cafe');

    await send(ingest, [first]);
    // The uploader retried the same batch.
    expect((await send(ingest, [first])).body).toEqual({ accepted: 0, duplicates: 1, rejected: 0 });
    // The app re-posted the payment under another key a minute later.
    ctx.clock.advance(60_000);
    await send(ingest, [item('E2E GASTO $500 EN Cafe', { postedAt: first.postedAt })]);

    expect(await ctx.prisma.transaction.count({ where: { userId: session.userId } })).toBe(1);
    const events = await ctx.prisma.rawEvent.findMany({
      where: { userId: session.userId },
      orderBy: { receivedAt: 'asc' },
    });
    expect(events.map((e) => [e.status, e.error])).toEqual([
      ['PROCESSED', null],
      ['PROCESSED', 'duplicate'],
    ]);
  });

  it('asks the user when confidence is low, for every income, and next to a manual twin', async () => {
    const session = await loginAs(ctx);
    const ingest = await enable(session);
    await api()
      .post('/transactions')
      .set(session.auth)
      .send({ amount: '777', method: 'DEBIT', occurredAt: ctx.clock.now().toISOString() })
      .expect(201);

    await send(ingest, [
      item('E2E QUIZAS $300 EN Algo'),
      item('E2E RECIBISTE $ 50.000'),
      item('E2E GASTO $777 EN Super'),
    ]);

    const auto = await ctx.prisma.transaction.findMany({
      where: { userId: session.userId, origin: 'TEMPLATE' },
      orderBy: { amount: 'asc' },
    });
    expect(auto.map((t) => [t.amount.toFixed(2), t.direction, t.status])).toEqual([
      ['300.00', 'OUT', 'PENDING'],
      ['777.00', 'OUT', 'PENDING'],
      ['50000.00', 'IN', 'PENDING'],
    ]);
  });

  it('keeps what no template recognizes as UNRECOGNIZED without creating anything', async () => {
    const session = await loginAs(ctx);
    const ingest = await enable(session);
    await send(ingest, [item('Promo: 30% de descuento este finde')]);

    const event = await ctx.prisma.rawEvent.findFirstOrThrow({ where: { userId: session.userId } });
    expect(event.status).toBe('UNRECOGNIZED');
    expect(await ctx.prisma.transaction.count({ where: { userId: session.userId } })).toBe(0);
  });

  it('turning capture off, logging out and an old token all stop the uploader', async () => {
    const a = await loginAs(ctx);
    const tokenA = await enable(a);
    await api().delete('/devices/current/ingest-token').set(a.auth).expect(204);
    await api().get('/ingest/config').set(tokenA).expect(401);

    const b = await loginAs(ctx);
    const tokenB = await enable(b);
    await api().post('/auth/logout').send({ refreshToken: b.refreshToken }).expect(204);
    await api().get('/ingest/config').set(tokenB).expect(401);

    const c = await loginAs(ctx);
    const tokenC = await enable(c);
    ctx.clock.advance(61 * 86_400_000);
    await api().get('/ingest/config').set(tokenC).expect(401);
    ctx.clock.set(new Date('2026-09-23T15:00:00Z'));
  });

  it('purges notifications after 30 days and keeps the movement', async () => {
    const session = await loginAs(ctx);
    const ingest = await enable(session);
    await send(ingest, [item('E2E GASTO $123 EN Viejo')]);

    // The session is long gone after a month; the ingest token (valid for 60 days) is not.
    ctx.clock.advance(31 * 86_400_000);
    await send(ingest, [item('E2E GASTO $456 EN Nuevo')]);
    ctx.clock.set(new Date('2026-09-23T15:00:00Z'));

    const events = await ctx.prisma.rawEvent.findMany({ where: { userId: session.userId } });
    expect(events).toHaveLength(1);
    const txs = await ctx.prisma.transaction.findMany({
      where: { userId: session.userId },
      orderBy: { amount: 'asc' },
    });
    expect(txs.map((t) => [t.amount.toFixed(2), t.rawEventId === null])).toEqual([
      ['123.00', true],
      ['456.00', false],
    ]);
  });

  it('validates the batch', async () => {
    const session = await loginAs(ctx);
    const ingest = await enable(session);
    await api().post('/ingest/notifications').set(ingest).send({ items: [] }).expect(400);
    await api()
      .post('/ingest/notifications')
      .set(ingest)
      .send({ items: Array.from({ length: 51 }, () => item('x')) })
      .expect(400);
  });
});
