import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { EmailIngestService } from '../src/inbound/email-ingest.service.js';
import { type FakeLlmProvider } from '../src/llm/fake-llm.provider.js';
import { type EmailExtraction, LLM_PROVIDER, LlmRejectedError } from '../src/llm/llm.provider.js';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type TestSession } from './helpers/auth.js';
import { cleanupE2eData } from './helpers/db.js';
import { createE2eSource, type E2eSource } from './helpers/ingest.js';

// SYNTHETIC emails only: invented senders and wording, the LLM is the in-process fake.
const WEBHOOK_AUTH = `Basic ${Buffer.from(
  `${process.env['INBOUND_WEBHOOK_USER'] ?? ''}:${process.env['INBOUND_WEBHOOK_PASSWORD'] ?? ''}`,
).toString('base64')}`;

const statement = (total: string, dueOn = '2026-10-25'): EmailExtraction => ({
  kind: 'card_statement',
  movement: null,
  statement: { issuer: 'Visa Banco de prueba', total, minimum: '1000.00', currency: 'ARS', dueOn },
  bill: null,
});
const utility = (amount: string): EmailExtraction => ({
  kind: 'bill',
  movement: null,
  statement: null,
  bill: {
    issuer: 'Luz de prueba',
    kind: 'UTILITY',
    amount,
    currency: 'ARS',
    dueOn: '2026-10-20',
    periodMonth: '2026-09',
  },
});
const purchase = (amount: string): EmailExtraction => ({
  kind: 'movement',
  movement: {
    amount,
    currency: 'ARS',
    direction: 'OUT',
    method: 'DEBIT',
    merchant: 'Kiosco de prueba',
    occurredAt: null,
  },
  statement: null,
  bill: null,
});

describe('inbound email and bills (e2e)', () => {
  let ctx: TestApp;
  let llm: FakeLlmProvider;
  let emails: EmailIngestService;
  let source: E2eSource;
  let seq = 0;

  beforeAll(async () => {
    ctx = await createTestApp();
    ctx.clock.set(new Date('2026-10-14T15:00:00Z'));
    llm = ctx.app.get<FakeLlmProvider>(LLM_PROVIDER);
    emails = ctx.app.get(EmailIngestService);
    source = await createE2eSource(ctx.prisma);
  });

  beforeEach(() => llm.reset());

  afterAll(async () => {
    await cleanupE2eData(ctx.prisma);
    await ctx.close();
  });

  const api = () => request(ctx.app.getHttpServer());

  async function addressOf(session: TestSession): Promise<string> {
    const res = await api().get('/me/inbound').set(session.auth).expect(200);
    return res.body.address as string;
  }

  function mail(to: string, fields: Record<string, unknown> = {}) {
    seq += 1;
    return {
      MessageID: `msg-${String(process.pid)}-${String(seq)}`,
      From: 'Banco de prueba <avisos@banco.test>',
      FromFull: { Email: 'avisos@banco.test', Name: 'Banco de prueba' },
      OriginalRecipient: to,
      ToFull: [{ Email: 'yo@correo.test', Name: '' }],
      Subject: 'Aviso',
      Date: 'Tue, 14 Oct 2026 11:00:00 -0300',
      TextBody: 'Texto de prueba',
      HtmlBody: '',
      Attachments: [],
      ...fields,
    };
  }

  async function deliver(body: object, expectOutcome?: string) {
    const res = await api().post('/inbound/postmark').set('Authorization', WEBHOOK_AUTH).send(body);
    expect(res.status).toBe(200);
    if (expectOutcome) expect(res.body.outcome).toBe(expectOutcome);
    await emails.drain();
    return res;
  }

  const summary = async (session: TestSession) =>
    (await api().get('/insights/summary').set(session.auth).expect(200)).body as {
      remaining: string;
      statement: { previous: { amount: string; source: string; paid: boolean } };
      bills: { unpaid: string; items: { id: string }[] };
      pending: {
        reviewBillIds: string[];
        crossChannelPairs: { keepId: string; dropId: string }[];
      };
    };

  it('gives each user a stable address that can be rotated', async () => {
    const session = await loginAs(ctx);
    const first = await addressOf(session);
    expect(first).toMatch(/^e2e-inbound\+[a-z2-9]{12}@inbound\.findemes\.test$/);
    expect(await addressOf(session)).toBe(first);

    const rotated = await api().post('/me/inbound/rotate').set(session.auth).expect(200);
    expect(rotated.body.address).not.toBe(first);
    await deliver(mail(first), 'unknown_recipient');
    expect(llm.emailCalls).toHaveLength(0);
  });

  it('refuses webhooks without the right credentials', async () => {
    await api().post('/inbound/postmark').send(mail('x@y.test')).expect(401);
    await api()
      .post('/inbound/postmark')
      .set('Authorization', `Basic ${Buffer.from('postmark:wrong').toString('base64')}`)
      .send(mail('x@y.test'))
      .expect(401);
  });

  it("shows Gmail's forwarding confirmation code without calling Claude", async () => {
    const session = await loginAs(ctx);
    const to = await addressOf(session);
    await deliver(
      mail(to, {
        From: 'Gmail Team <forwarding-noreply@google.com>',
        FromFull: { Email: 'forwarding-noreply@google.com', Name: 'Gmail Team' },
        Subject: 'Gmail Forwarding Confirmation',
        TextBody: 'Confirmation code: 123456789 https://mail-settings.google.com/mail/vf-xyz',
      }),
      'gmail_confirmation',
    );
    const res = await api().get('/me/inbound').set(session.auth).expect(200);
    expect(res.body.gmailConfirmation).toMatchObject({
      code: '123456789',
      link: 'https://mail-settings.google.com/mail/vf-xyz',
    });
    expect(llm.emailCalls).toHaveLength(0);
  });

  it('drops verification codes without storing them', async () => {
    const session = await loginAs(ctx);
    await deliver(
      mail(await addressOf(session), { Subject: 'Tu código', TextBody: 'Tu código es 482913' }),
      'security_code',
    );
    expect(await ctx.prisma.rawEvent.count({ where: { userId: session.userId } })).toBe(0);
  });

  it('turns a card statement with its PDF into the real previous statement, once', async () => {
    const session = await loginAs(ctx);
    const to = await addressOf(session);
    llm.respondToEmailWith(() => statement('150000.00'));
    const first = mail(to, {
      Subject: 'Tu resumen',
      Attachments: [
        {
          Name: 'resumen.pdf',
          Content: 'JVBERi0xLjQK',
          ContentType: 'application/pdf',
          ContentLength: 9,
        },
        { Name: 'logo.png', Content: 'iVBORw0K', ContentType: 'image/png', ContentLength: 6 },
      ],
    });
    await deliver(first, 'stored');
    expect(llm.emailCalls[0]?.pdfs).toEqual([{ name: 'resumen.pdf', base64: 'JVBERi0xLjQK' }]);

    const bills = await ctx.prisma.bill.findMany({ where: { userId: session.userId } });
    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatchObject({ kind: 'CARD_STATEMENT', status: 'PENDING', origin: 'EMAIL' });
    const event = await ctx.prisma.rawEvent.findFirstOrThrow({ where: { userId: session.userId } });
    expect(Buffer.from(event.payloadEnc).toString('utf8')).not.toContain('resumen');

    const s = await summary(session);
    expect(s.statement.previous).toMatchObject({ amount: '150000.00', source: 'bill' });
    expect(s.pending.reviewBillIds).toEqual([bills[0]?.id]);

    await deliver(first, 'duplicate');
    await deliver(mail(to, { Subject: 'Recordatorio: vence tu resumen' }), 'stored');
    expect(await ctx.prisma.bill.count({ where: { userId: session.userId } })).toBe(1);
    const usage = await ctx.prisma.llmUsage.findMany({ where: { userId: session.userId } });
    expect(usage.map((u) => u.purpose)).toEqual(['email', 'email']);
  });

  it('confirms a bill, finds its payment candidates and marks it paid with "Pagué"', async () => {
    const session = await loginAs(ctx);
    llm.respondToEmailWith(() => utility('80000.00'));
    await deliver(mail(await addressOf(session), { Subject: 'Tu factura' }), 'stored');
    const bill = await ctx.prisma.bill.findFirstOrThrow({ where: { userId: session.userId } });

    let s = await summary(session);
    expect(s.bills.unpaid).toBe('80000.00');

    await api().patch(`/bills/${bill.id}`).set(session.auth).send({ status: 'UNPAID' }).expect(200);
    const listed = await api().get('/bills').set(session.auth).expect(200);
    expect(listed.body.items.map((b: { id: string }) => b.id)).toEqual([bill.id]);

    const paid = await api()
      .post(`/bills/${bill.id}/payments`)
      .set(session.auth)
      .send({})
      .expect(200);
    expect(paid.body.status).toBe('PAID');
    s = await summary(session);
    expect(s.bills.unpaid).toBe('0.00');
    await api().post(`/bills/${bill.id}/payments`).set(session.auth).send({}).expect(409);

    // Deleting the payment makes it owed again.
    await api()
      .delete(`/transactions/${paid.body.paidTransactionId as string}`)
      .set(session.auth)
      .expect(204);
    s = await summary(session);
    expect(s.bills.unpaid).toBe('80000.00');
    const again = await api().get('/bills').set(session.auth).expect(200);
    expect(again.body.items[0].status).toBe('UNPAID');
  });

  it("paying the commitment pays its bill at the bill's price", async () => {
    const session = await loginAs(ctx);
    const commitment = await api()
      .post('/commitments')
      .set(session.auth)
      .send({
        kind: 'SERVICE',
        name: 'Gas',
        amount: '20000',
        method: 'DEBIT',
        dayOfMonth: 20,
        startsOn: '2026-01',
      })
      .expect(201);
    llm.respondToEmailWith(() => utility('35000.00'));
    await deliver(mail(await addressOf(session)), 'stored');
    const bill = await ctx.prisma.bill.findFirstOrThrow({ where: { userId: session.userId } });
    await api()
      .patch(`/bills/${bill.id}`)
      .set(session.auth)
      .send({ status: 'UNPAID', commitmentId: commitment.body.id })
      .expect(200);

    const paid = await api()
      .post(`/commitments/${commitment.body.id as string}/payments`)
      .set(session.auth)
      .send({ commitmentMonth: '2026-10' })
      .expect(201);
    expect(paid.body.amount).toBe('35000.00');
    const after = await ctx.prisma.bill.findUniqueOrThrow({ where: { id: bill.id } });
    expect(after).toMatchObject({ status: 'PAID', paidTransactionId: paid.body.id });
    await api()
      .post(`/commitments/${commitment.body.id as string}/payments`)
      .set(session.auth)
      .send({ commitmentMonth: '2026-10' })
      .expect(409);
  });

  it('never offers or accepts a movement that already pays something else', async () => {
    const session = await loginAs(ctx);
    llm.respondToEmailWith(() => utility('70000.00'));
    await deliver(mail(await addressOf(session)), 'stored');
    const bill = await ctx.prisma.bill.findFirstOrThrow({ where: { userId: session.userId } });
    const statementPayment = await api()
      .post('/transactions')
      .set(session.auth)
      .send({ amount: '70000', method: 'DEBIT', isStatementPayment: true })
      .expect(201);
    const candidates = await api()
      .get(`/bills/${bill.id}/candidates`)
      .set(session.auth)
      .expect(200);
    expect(candidates.body).toEqual([]);
    await api()
      .post(`/bills/${bill.id}/payments`)
      .set(session.auth)
      .send({ transactionId: statementPayment.body.id })
      .expect(400);
  });

  it('links an existing movement as the payment of a commitment-priced bill', async () => {
    const session = await loginAs(ctx);
    const commitment = await api()
      .post('/commitments')
      .set(session.auth)
      .send({
        kind: 'SERVICE',
        name: 'Luz',
        amount: '50000',
        method: 'DEBIT',
        dayOfMonth: 20,
        startsOn: '2026-01',
      })
      .expect(201);
    llm.respondToEmailWith(() => utility('62000.00'));
    await deliver(mail(await addressOf(session)), 'stored');
    const bill = await ctx.prisma.bill.findFirstOrThrow({ where: { userId: session.userId } });
    await api()
      .patch(`/bills/${bill.id}`)
      .set(session.auth)
      .send({ status: 'UNPAID', commitmentId: commitment.body.id })
      .expect(200);

    const tx = await api()
      .post('/transactions')
      .set(session.auth)
      .send({ amount: '62000', method: 'DEBIT', merchantRaw: 'Pago luz' })
      .expect(201);
    const candidates = await api()
      .get(`/bills/${bill.id}/candidates`)
      .set(session.auth)
      .expect(200);
    expect(candidates.body.map((t: { id: string }) => t.id)).toContain(tx.body.id);

    const before = await summary(session);
    await api()
      .post(`/bills/${bill.id}/payments`)
      .set(session.auth)
      .send({ transactionId: tx.body.id })
      .expect(200);
    const after = await summary(session);
    // The payment already counted as cash; linking it settles the commitment at the bill's price.
    expect(Number(after.remaining)).toBe(Number(before.remaining) + 62000);
    const linked = await ctx.prisma.transaction.findUniqueOrThrow({
      where: { id: tx.body.id as string },
    });
    expect(linked.commitmentId).toBe(commitment.body.id);
  });

  it('pairs the same payment seen by a notification and by an email', async () => {
    const session = await loginAs(ctx);
    const token = await api().post('/devices/current/ingest-token').set(session.auth).expect(201);
    await api()
      .post('/ingest/notifications')
      .set('Authorization', `Bearer ${token.body.token as string}`)
      .send({
        items: [
          {
            key: `mail-pair-${String(process.pid)}`,
            packageName: source.packageName,
            postedAt: ctx.clock.now().toISOString(),
            text: 'E2E GASTO $4.500 EN Kiosco',
          },
        ],
      })
      .expect(200);
    llm.respondToEmailWith(() => purchase('4500.00'));
    await deliver(mail(await addressOf(session)), 'stored');

    const txs = await ctx.prisma.transaction.findMany({
      where: { userId: session.userId },
      include: { rawEvent: { select: { channel: true } } },
    });
    const notified = txs.find((t) => t.rawEvent?.channel === 'ANDROID_NOTIFICATION');
    const emailed = txs.find((t) => t.rawEvent?.channel === 'EMAIL');
    expect(emailed?.status).toBe('PENDING');
    const s = await summary(session);
    expect(s.pending.crossChannelPairs).toEqual([{ keepId: notified?.id, dropId: emailed?.id }]);
  });

  it('marks Claude errors FAILED and retries them on a later email after the backoff', async () => {
    const session = await loginAs(ctx);
    const to = await addressOf(session);
    llm.respondToEmailWith(() => new Error('timeout'));
    await deliver(mail(to), 'stored');
    const failed = await ctx.prisma.rawEvent.findFirstOrThrow({
      where: { userId: session.userId },
    });
    expect(failed.status).toBe('FAILED');

    ctx.clock.advance(6 * 60_000);
    llm.respondToEmailWith(() => utility('1000.00'));
    await deliver(mail(to, { Subject: 'otra' }), 'stored');
    const retried = await ctx.prisma.rawEvent.findUniqueOrThrow({ where: { id: failed.id } });
    expect(retried.status).toBe('PROCESSED');
    ctx.clock.set(new Date('2026-10-14T15:00:00Z'));
  });

  it('gives up after three failures, and at once on input the provider refuses', async () => {
    const session = await loginAs(ctx);
    const to = await addressOf(session);
    llm.respondToEmailWith(() => new Error('timeout'));
    await deliver(mail(to), 'stored');
    const failing = await ctx.prisma.rawEvent.findFirstOrThrow({
      where: { userId: session.userId },
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      ctx.clock.advance(6 * 60_000);
      await deliver(mail(to, { Subject: `otra ${String(attempt)}` }), 'stored');
    }
    const gaveUp = await ctx.prisma.rawEvent.findUniqueOrThrow({ where: { id: failing.id } });
    expect([gaveUp.status, gaveUp.error]).toEqual(['UNRECOGNIZED', 'llm_failed']);

    llm.respondToEmailWith(() => new LlmRejectedError('status_400'));
    await deliver(mail(to, { Subject: 'pdf con clave' }), 'stored');
    const rejected = await ctx.prisma.rawEvent.findFirstOrThrow({
      where: { userId: session.userId, error: 'llm_rejected' },
    });
    expect(rejected.status).toBe('UNRECOGNIZED');
    ctx.clock.set(new Date('2026-10-14T15:00:00Z'));
  });

  it('ignores a bill whose due date does not exist, and records the call anyway', async () => {
    const session = await loginAs(ctx);
    llm.respondToEmailWith(() => ({
      ...utility('5000.00'),
      bill: {
        ...(utility('5000.00').bill as NonNullable<EmailExtraction['bill']>),
        dueOn: '2026-02-29',
      },
    }));
    await deliver(mail(await addressOf(session)), 'stored');
    const event = await ctx.prisma.rawEvent.findFirstOrThrow({ where: { userId: session.userId } });
    expect(event.status).toBe('UNRECOGNIZED');
    expect(await ctx.prisma.llmUsage.count({ where: { rawEventId: event.id } })).toBe(1);
  });

  it('keeps the notification cap apart from the email cap', async () => {
    const session = await loginAs(ctx);
    await ctx.prisma.llmUsage.createMany({
      data: Array.from({ length: 30 }, () => ({
        userId: session.userId,
        purpose: 'email',
        model: 'x',
        inputTokens: 0,
        outputTokens: 0,
        costMicros: 0,
        outcome: 'parsed',
        createdAt: ctx.clock.now(),
      })),
    });
    const token = await api().post('/devices/current/ingest-token').set(session.auth).expect(201);
    await api()
      .post('/ingest/notifications')
      .set('Authorization', `Bearer ${token.body.token as string}`)
      .send({
        items: [
          {
            key: `cap-${String(process.pid)}`,
            packageName: source.packageName,
            postedAt: ctx.clock.now().toISOString(),
            text: 'algo que ninguna template conoce',
          },
        ],
      })
      .expect(200);
    expect(llm.calls).toHaveLength(1);
  });
});
