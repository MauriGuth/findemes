import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type FakeLlmProvider } from '../src/llm/fake-llm.provider.js';
import { LLM_PROVIDER, LlmRejectedError, type ReceiptExtraction } from '../src/llm/llm.provider.js';
import { ReceiptsService } from '../src/receipts/receipts.service.js';
import { StorageService } from '../src/storage/storage.service.js';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type TestSession } from './helpers/auth.js';
import { cleanupE2eData } from './helpers/db.js';
import { createE2eSource, type E2eSource } from './helpers/ingest.js';
import { FakeStorage } from './helpers/storage.js';

// SYNTHETIC tickets and sentences only; the LLM and the bucket are in-process fakes.
const ticket = (total: string, overrides: Partial<ReceiptExtraction> = {}): ReceiptExtraction => ({
  isReceipt: true,
  merchant: 'Almacén de prueba',
  cuit: '30-12345678-9',
  issuedAt: '2026-10-14T11:30',
  total,
  currency: 'ARS',
  paymentMethodHint: null,
  items: [
    { name: 'Yerba', qty: '1', unitPrice: '3000.00', total: '3000.00', category: 'supermercado' },
    { name: 'Alfajor', qty: '2', unitPrice: null, total: '1000.00', category: 'comida' },
    { name: '', qty: '1', unitPrice: null, total: '1.00', category: 'otros' },
  ],
  ...overrides,
});

describe('receipts and AI entries (e2e)', () => {
  let ctx: TestApp;
  let llm: FakeLlmProvider;
  let storage: FakeStorage;
  let receipts: ReceiptsService;
  let source: E2eSource;

  beforeAll(async () => {
    storage = new FakeStorage();
    ctx = await createTestApp({
      customize: (builder) => builder.overrideProvider(StorageService).useValue(storage),
    });
    llm = ctx.app.get<FakeLlmProvider>(LLM_PROVIDER);
    receipts = ctx.app.get(ReceiptsService);
    source = await createE2eSource(ctx.prisma);
  });

  beforeEach(() => {
    ctx.clock.set(new Date('2026-10-14T15:00:00Z'));
    llm.reset();
  });

  afterAll(async () => {
    await cleanupE2eData(ctx.prisma);
    await ctx.close();
  });

  const api = () => request(ctx.app.getHttpServer());

  async function upload(session: TestSession): Promise<string> {
    const res = await api().post('/receipts/upload-url').set(session.auth).expect(200);
    const key = res.body.key as string;
    expect(key.startsWith(`receipts/${session.userId}/`)).toBe(true);
    expect(res.body.url).toContain('method=PUT');
    await storage.put(key, Buffer.from('fake-jpeg'));
    return key;
  }

  async function createReceipt(session: TestSession, key: string) {
    const res = await api().post('/receipts').set(session.auth).send({ key }).expect(201);
    await receipts.drain();
    return api()
      .get(`/receipts/${res.body.id as string}`)
      .set(session.auth)
      .expect(200);
  }

  it('reports which features are configured', async () => {
    const session = await loginAs(ctx);
    const res = await api().get('/features').set(session.auth).expect(200);
    expect(res.body).toEqual({ receipts: true, aiEntries: true, telegram: false, whatsapp: false });
  });

  it('a ticket without a matching movement creates a pending cash movement with its items', async () => {
    const session = await loginAs(ctx);
    llm.respondToReceiptWith(() => ticket('4000.00'));
    const res = await createReceipt(session, await upload(session));

    expect(res.body).toMatchObject({
      status: 'UNMATCHED',
      merchant: 'Almacén de prueba',
      cuit: '30123456789',
      total: '4000.00',
      issuedAt: '2026-10-14T14:30:00.000Z',
      error: null,
    });
    expect(res.body.items).toHaveLength(2);
    expect(res.body.imageUrl).toContain('method=GET');
    expect(llm.receiptCalls[0]?.categorySlugs).toContain('supermercado');

    const tx = await ctx.prisma.transaction.findUniqueOrThrow({
      where: { id: res.body.transactionId as string },
      include: { category: true },
    });
    expect(tx).toMatchObject({
      status: 'PENDING',
      method: 'CASH',
      origin: 'LLM',
      direction: 'OUT',
    });
    expect(tx.category?.slug).toBe('supermercado');
    const usage = await ctx.prisma.llmUsage.findFirstOrThrow({ where: { userId: session.userId } });
    expect(usage).toMatchObject({ purpose: 'receipt', outcome: 'parsed' });

    // It shows up in Pendientes like any detected expense.
    const summary = await api().get('/insights/summary').set(session.auth).expect(200);
    expect(summary.body.pending.reviewTransactionIds).toContain(tx.id);
  });

  it('a ticket of a payment already seen is linked to it, within $1 and 48 h', async () => {
    const session = await loginAs(ctx);
    const manual = await api()
      .post('/transactions')
      .set(session.auth)
      .send({ amount: '4000.50', method: 'DEBIT', occurredAt: '2026-10-13T20:00:00-03:00' })
      .expect(201);
    llm.respondToReceiptWith(() => ticket('4000.00'));
    const res = await createReceipt(session, await upload(session));
    expect(res.body.status).toBe('MATCHED');
    expect(res.body.transactionId).toBe(manual.body.id);
    const tx = await ctx.prisma.transaction.findUniqueOrThrow({
      where: { id: manual.body.id as string },
      include: { category: true },
    });
    expect(tx.status).toBe('CONFIRMED');
    expect(tx.amount.toFixed(2)).toBe('4000.50');
    expect(tx.category?.slug).toBe('supermercado');
    expect(tx.merchantRaw).toBe('Almacén de prueba');
  });

  it('the notification of a photographed payment completes the ticket movement', async () => {
    const session = await loginAs(ctx);
    llm.respondToReceiptWith(() => ticket('1234.56'));
    const res = await createReceipt(session, await upload(session));
    expect(res.body.status).toBe('UNMATCHED');

    const token = await api().post('/devices/current/ingest-token').set(session.auth).expect(201);
    await api()
      .post('/ingest/notifications')
      .set({ Authorization: `Bearer ${token.body.token as string}` })
      .send({
        items: [
          {
            key: `0|${source.packageName}|r1|null|10001`,
            packageName: source.packageName,
            postedAt: ctx.clock.now().toISOString(),
            title: null,
            text: 'E2E GASTO $1.234,56 EN Almacen',
          },
        ],
      })
      .expect(200);

    const txs = await ctx.prisma.transaction.findMany({ where: { userId: session.userId } });
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({
      id: res.body.transactionId,
      status: 'CONFIRMED',
      origin: 'TEMPLATE',
      method: 'DEBIT',
      sourceId: source.id,
      merchantRaw: 'Almacén de prueba',
    });
    expect(txs[0]?.rawEventId).not.toBeNull();
  });

  it('failures say why and can be retried; deleting removes the photo and its movement', async () => {
    const session = await loginAs(ctx);
    llm.respondToReceiptWith(() => ticket('0', { isReceipt: false }));
    const key = await upload(session);
    const failed = await createReceipt(session, key);
    expect(failed.body).toMatchObject({ status: 'FAILED', transactionId: null });
    expect(failed.body.error).toMatch(/No encontramos un ticket/);

    llm.respondToReceiptWith(() => new LlmRejectedError('status_400'));
    await api()
      .post(`/receipts/${failed.body.id as string}/retry`)
      .set(session.auth)
      .expect(200);
    await receipts.drain();
    const rejected = await api()
      .get(`/receipts/${failed.body.id as string}`)
      .set(session.auth);
    expect(rejected.body.error).toMatch(/No pudimos leer la foto/);

    llm.respondToReceiptWith(() => ticket('500.00'));
    await api()
      .post(`/receipts/${failed.body.id as string}/retry`)
      .set(session.auth)
      .expect(200);
    await receipts.drain();
    const ok = await api()
      .get(`/receipts/${failed.body.id as string}`)
      .set(session.auth);
    expect(ok.body.status).toBe('UNMATCHED');
    await api()
      .post(`/receipts/${failed.body.id as string}/retry`)
      .set(session.auth)
      .expect(409);

    await api()
      .delete(`/receipts/${failed.body.id as string}`)
      .set(session.auth)
      .expect(204);
    expect(storage.deleted).toContain(key);
    expect(await ctx.prisma.transaction.count({ where: { userId: session.userId } })).toBe(0);
  });

  it('a key of another user is refused and the same key twice is one receipt', async () => {
    const a = await loginAs(ctx);
    const b = await loginAs(ctx);
    const key = await upload(a);
    await api().post('/receipts').set(b.auth).send({ key }).expect(400);
    await api().post('/receipts').set(b.auth).send({ key: 'receipts/../x.jpg' }).expect(400);
    const first = await api().post('/receipts').set(a.auth).send({ key }).expect(201);
    const second = await api().post('/receipts').set(a.auth).send({ key }).expect(201);
    expect(second.body.id).toBe(first.body.id);
    await receipts.drain();
    await api()
      .get(`/receipts/${first.body.id as string}`)
      .set(b.auth)
      .expect(404);
  });

  it('parses a typed sentence into drafts and saves the reviewed ones', async () => {
    const session = await loginAs(ctx);
    llm.respondToEntryWith(() => ({
      entries: [
        {
          amount: '50000',
          currency: 'ARS',
          direction: 'OUT',
          method: 'CASH',
          merchant: 'súper',
          category: 'supermercado',
          date: null,
        },
        {
          amount: '20000',
          currency: 'ARS',
          direction: 'OUT',
          method: 'WALLET',
          merchant: 'taxi',
          category: 'transporte',
          date: '2026-10-13',
        },
        {
          amount: 'mucho',
          currency: 'ARS',
          direction: 'OUT',
          method: 'CASH',
          merchant: null,
          category: 'otros',
          date: null,
        },
        {
          amount: '100',
          currency: 'ARS',
          direction: 'OUT',
          method: 'CASH',
          merchant: null,
          category: 'otros',
          date: '2027-01-01',
        },
      ],
    }));
    const parsed = await api()
      .post('/entries/parse')
      .set(session.auth)
      .send({ text: 'gasté 50 lucas en el súper y ayer 20 en el taxi' })
      .expect(200);
    expect(parsed.body.drafts).toHaveLength(3);
    expect(parsed.body.drafts[0]).toMatchObject({
      amount: '50000.00',
      merchantRaw: 'súper',
      occurredAt: null,
    });
    expect(parsed.body.drafts[1].occurredAt).toBe('2026-10-13T15:00:00.000Z');
    expect(parsed.body.drafts[2].occurredAt).toBeNull();
    expect(llm.entryCalls[0]?.today).toBe('2026-10-14');
    expect(await ctx.prisma.transaction.count({ where: { userId: session.userId } })).toBe(0);

    const saved = await api()
      .post('/entries')
      .set(session.auth)
      .send({ drafts: parsed.body.drafts.slice(0, 2) })
      .expect(201);
    expect(saved.body.items).toHaveLength(2);
    expect(saved.body.items[0]).toMatchObject({
      origin: 'MANUAL',
      status: 'CONFIRMED',
      amount: '50000.00',
    });
  });

  it('the shared daily cap stops tickets and entries', async () => {
    const session = await loginAs(ctx);
    const rows = Array.from({ length: 40 }, () => ({
      userId: session.userId,
      purpose: 'entry',
      model: 'fake-model',
      inputTokens: 1,
      outputTokens: 1,
      costMicros: 1,
      outcome: 'parsed',
      createdAt: ctx.clock.now(),
    }));
    await ctx.prisma.llmUsage.createMany({ data: rows });
    const res = await api().post('/entries/parse').set(session.auth).send({ text: 'gasté 100' });
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/límite/);
    const receipt = await createReceipt(session, await upload(session));
    expect(receipt.body.error).toMatch(/límite/);
    expect(llm.receiptCalls).toHaveLength(0);
  });

  it('deleting the account deletes the photos from the bucket', async () => {
    const session = await loginAs(ctx);
    llm.respondToReceiptWith(() => ticket('700.00'));
    const key = await upload(session);
    await createReceipt(session, key);
    await api().delete('/me').set(session.auth).expect(204);
    expect(storage.deleted).toContain(key);
  });
});
