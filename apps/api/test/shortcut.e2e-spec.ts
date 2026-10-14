import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type FakeLlmProvider } from '../src/llm/fake-llm.provider.js';
import { LLM_PROVIDER } from '../src/llm/llm.provider.js';
import { AlertsService } from '../src/push/alerts.service.js';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs } from './helpers/auth.js';
import { cleanupE2eData } from './helpers/db.js';
import { createE2eSource, type E2eSource } from './helpers/ingest.js';

// SYNTHETIC SMS texts and Apple Pay fields; the templates match the invented "E2E" format.
describe('iPhone shortcuts (e2e)', () => {
  let ctx: TestApp;
  let llm: FakeLlmProvider;
  let source: E2eSource;

  beforeAll(async () => {
    ctx = await createTestApp();
    llm = ctx.app.get<FakeLlmProvider>(LLM_PROVIDER);
    source = await createE2eSource(ctx.prisma);
  });

  beforeEach(() => {
    ctx.clock.set(new Date('2026-10-14T15:00:00Z'));
    llm.reset();
  });

  afterAll(async () => {
    await ctx.app.get(AlertsService).drain();
    await cleanupE2eData(ctx.prisma);
    await ctx.close();
  });

  const api = () => request(ctx.app.getHttpServer());

  async function setup() {
    const session = await loginAs(ctx);
    const res = await api().post('/devices/current/ingest-token').set(session.auth).expect(201);
    return { session, auth: { Authorization: `Bearer ${res.body.token as string}` } };
  }

  it('a bank SMS with a known sender goes through the templates, once per minute', async () => {
    const { session, auth } = await setup();
    const body = { text: 'E2E GASTO $1.500 EN Kiosco Pepito', sender: 'E2E Bank' };
    const first = await api().post('/ingest/shortcut').set(auth).send(body).expect(200);
    expect(first.body).toEqual({ outcome: 'movement' });
    const again = await api().post('/ingest/shortcut').set(auth).send(body).expect(200);
    expect(again.body).toEqual({ outcome: 'duplicate' });

    const txs = await ctx.prisma.transaction.findMany({ where: { userId: session.userId } });
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ sourceId: source.id, origin: 'TEMPLATE', status: 'CONFIRMED' });
    const raw = await ctx.prisma.rawEvent.findFirstOrThrow({ where: { userId: session.userId } });
    expect(raw.channel).toBe('IOS_SHORTCUT');
    expect(Buffer.from(raw.payloadEnc).toString('utf8')).not.toContain('Kiosco');
    expect(llm.calls).toHaveLength(0);
  });

  it('an unknown message goes to Claude; a security code is dropped', async () => {
    const { session, auth } = await setup();
    llm.respondWith(() => ({
      isFinancial: true,
      amount: '2500.00',
      currency: 'ARS',
      direction: 'OUT',
      method: 'DEBIT',
      merchant: 'Farmacia',
    }));
    const res = await api()
      .post('/ingest/shortcut')
      .set(auth)
      .send({ text: 'Compra con tarjeta de débito por $2.500 en Farmacia', sender: '22222' })
      .expect(200);
    expect(res.body.outcome).toBe('movement');
    expect(llm.calls[0]?.sourceName).toMatch(/iPhone/);

    const code = await api()
      .post('/ingest/shortcut')
      .set(auth)
      .send({ text: 'Tu código de verificación es 482913. No lo compartas.' })
      .expect(200);
    expect(code.body.outcome).toBe('ignored');
    expect(await ctx.prisma.rawEvent.count({ where: { userId: session.userId } })).toBe(1);
  });

  it('Apple Pay: amount as the iPhone formats it, debit or credit from the card name', async () => {
    const { session, auth } = await setup();
    await api()
      .post('/ingest/shortcut')
      .set(auth)
      .send({ kind: 'apple_pay', amount: '$ 12.345,67', merchant: 'Café', card: 'E2E Bank Débito' })
      .expect(200);
    ctx.clock.set(new Date('2026-10-14T15:05:00Z'));
    await api()
      .post('/ingest/shortcut')
      .set(auth)
      .send({ kind: 'apple_pay', amount: 'US$ 20', merchant: 'App Store', card: 'Visa' })
      .expect(200);
    const txs = await ctx.prisma.transaction.findMany({
      where: { userId: session.userId },
      orderBy: { occurredAt: 'asc' },
    });
    expect(
      txs.map((t) => [t.amount.toFixed(2), t.currency, t.method, t.status, t.sourceId]),
    ).toEqual([
      ['12345.67', 'ARS', 'DEBIT', 'PENDING', source.id],
      ['20.00', 'USD', 'CREDIT', 'PENDING', null],
    ]);
    await api().post('/ingest/shortcut').set(auth).send({ kind: 'apple_pay' }).expect(400);
  });

  it('only the ingest token opens it', async () => {
    const { session } = await setup();
    await api().post('/ingest/shortcut').set(session.auth).send({ text: 'x' }).expect(401);
    await api().post('/ingest/shortcut').send({ text: 'x' }).expect(401);
  });

  it('an iPhone key does not age out; an Android one does after 60 days', async () => {
    const { session, auth } = await setup();
    await ctx.prisma.device.update({ where: { id: session.deviceId }, data: { platform: 'IOS' } });
    ctx.clock.set(new Date('2027-03-01T15:00:00Z'));
    await api().post('/ingest/shortcut').set(auth).send({ text: 'hola' }).expect(200);
    await ctx.prisma.device.update({
      where: { id: session.deviceId },
      data: { platform: 'ANDROID' },
    });
    await api().post('/ingest/shortcut').set(auth).send({ text: 'hola 2' }).expect(401);
  });

  it('a Shortcut retried after a failure is processed, not a duplicate', async () => {
    const { session, auth } = await setup();
    llm.respondWith(() => new Error('overloaded'));
    const body = { text: 'Compraste $900 en Panaderia', sender: '33333' };
    await api().post('/ingest/shortcut').set(auth).send(body).expect(503);
    llm.respondWith(() => ({
      isFinancial: true,
      amount: '900.00',
      currency: 'ARS',
      direction: 'OUT',
      method: 'DEBIT',
      merchant: 'Panaderia',
    }));
    const retry = await api().post('/ingest/shortcut').set(auth).send(body).expect(200);
    expect(retry.body.outcome).toBe('movement');
    expect(await ctx.prisma.transaction.count({ where: { userId: session.userId } })).toBe(1);
  });
});
