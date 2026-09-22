import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type TestSession } from './helpers/auth.js';
import { cleanupE2eData } from './helpers/db.js';

describe('insights (e2e)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
    ctx.clock.set(new Date('2026-09-21T15:00:00Z')); // 21/9 12:00 ART
  });

  afterAll(async () => {
    await cleanupE2eData(ctx.prisma);
    await ctx.close();
  });

  const api = () => request(ctx.app.getHttpServer());
  const summary = (s: TestSession, month?: string) =>
    api()
      .get(`/insights/summary${month ? `?month=${month}` : ''}`)
      .set(s.auth)
      .expect(200);

  it('T1c: expected income, cash spent, unpaid rent, then the confirmed salary', async () => {
    const s = await loginAs(ctx);
    await api().put('/plans/2026-09').set(s.auth).send({ expectedIncome: '1500000' }).expect(200);
    await api()
      .post('/commitments')
      .set(s.auth)
      .send({
        kind: 'RENT',
        name: 'Alquiler',
        amount: '450000',
        dayOfMonth: 10,
        startsOn: '2026-01',
      })
      .expect(201);
    await api()
      .post('/transactions')
      .set(s.auth)
      .send({ amount: '25000', method: 'DEBIT', occurredAt: '2026-09-05T15:00:00Z' })
      .expect(201);
    await api()
      .post('/transactions')
      .set(s.auth)
      .send({ amount: '8000', method: 'WALLET', occurredAt: '2026-09-20T15:00:00Z' })
      .expect(201);

    const before = await summary(s);
    expect(before.body).toMatchObject({
      month: '2026-09',
      today: '2026-09-21',
      daysLeft: 10,
      income: { total: '1500000.00', source: 'expected' },
      spent: { cash: '33000.00', credit: '0.00' },
      commitments: { unpaidCash: '450000.00' },
      remaining: '1017000.00',
      perDay: '101700.00',
      statement: { previous: { amount: '0.00', paid: true }, next: '0.00' },
      pending: { needsPlan: false, needsSalaryConfirmation: false },
    });
    expect(before.body.pending.unpaidDueCommitmentIds).toHaveLength(1);

    await api()
      .post('/transactions')
      .set(s.auth)
      .send({
        amount: '1480000',
        method: 'TRANSFER',
        direction: 'IN',
        markAsSalary: true,
        occurredAt: '2026-09-04T13:00:00Z',
      })
      .expect(201);
    const after = await summary(s);
    expect(after.body.income).toMatchObject({
      total: '1480000.00',
      source: 'confirmed',
      salary: '1480000.00',
      other: '0.00',
    });
    expect(after.body.remaining).toBe('997000.00');
  });

  it('T2b: installment 4 of 6, and paying it does not move the number', async () => {
    const s = await loginAs(ctx);
    await api().put('/plans/2026-09').set(s.auth).send({ expectedIncome: '1500000' }).expect(200);
    const cuota = await api()
      .post('/commitments')
      .set(s.auth)
      .send({
        kind: 'INSTALLMENT',
        name: 'Heladera',
        amount: '100000',
        dayOfMonth: 15,
        installmentsTotal: 6,
        startsOn: '2026-06',
      })
      .expect(201);

    const unpaid = await summary(s);
    expect(unpaid.body.remaining).toBe('1400000.00');
    expect(unpaid.body.commitments.items[0]).toMatchObject({
      id: cuota.body.id,
      dueOn: '2026-09-15',
      paid: false,
      installmentNumber: 4,
      installmentsLeft: 2,
    });

    await api().post(`/commitments/${cuota.body.id}/payments`).set(s.auth).send({}).expect(201);
    const paid = await summary(s);
    expect(paid.body.remaining).toBe('1400000.00');
    expect(paid.body.spent.cash).toBe('100000.00');
    expect(paid.body.commitments).toMatchObject({ unpaidCash: '0.00', paidCash: '100000.00' });
    expect(paid.body.commitments.items[0].paid).toBe(true);
  });

  it('T3c: the previous statement leaves the cash next month until it is paid', async () => {
    const s = await loginAs(ctx);
    await api().put('/plans/2026-09').set(s.auth).send({ expectedIncome: '1500000' }).expect(200);
    await api().put('/plans/2026-10').set(s.auth).send({ expectedIncome: '1500000' }).expect(200);
    await api()
      .post('/transactions')
      .set(s.auth)
      .send({ amount: '120000', method: 'CREDIT', occurredAt: '2026-09-12T15:00:00Z' })
      .expect(201);
    await api()
      .post('/commitments')
      .set(s.auth)
      .send({
        kind: 'SUBSCRIPTION',
        name: 'Netflix',
        amount: '9000',
        dayOfMonth: 20,
        method: 'CREDIT',
        startsOn: '2026-09',
      })
      .expect(201);

    const sep = await summary(s, '2026-09');
    expect(sep.body.statement.next).toBe('129000.00');
    expect(sep.body.remaining).toBe('1500000.00');

    const oct = await summary(s, '2026-10');
    expect(oct.body.statement.previous).toEqual({
      amount: '129000.00',
      paid: false,
      paidAmount: '0.00',
    });
    expect(oct.body.remaining).toBe('1371000.00');
    expect(oct.body.pending.needsStatementPayment).toBe(true);
    expect(oct.body.daysLeft).toBe(31);

    await api()
      .post('/transactions')
      .set(s.auth)
      .send({
        amount: '129000',
        method: 'DEBIT',
        isStatementPayment: true,
        occurredAt: '2026-10-04T15:00:00Z',
      })
      .expect(201);
    const paid = await summary(s, '2026-10');
    expect(paid.body.statement.previous.paid).toBe(true);
    expect(paid.body.remaining).toBe('1371000.00');
    expect(paid.body.spent.cash).toBe('129000.00');
  });

  it('respects the calendar: next-month commitments, the ART border and the carried plan', async () => {
    const s = await loginAs(ctx);
    await api()
      .post('/commitments')
      .set(s.auth)
      .send({
        kind: 'RENT',
        name: 'Alquiler',
        amount: '450000',
        dayOfMonth: 10,
        startsOn: '2026-10',
      })
      .expect(201);
    await api()
      .post('/transactions')
      .set(s.auth)
      .send({ amount: '10', method: 'CASH', occurredAt: '2026-10-01T02:30:00Z' })
      .expect(201);
    await api().put('/plans/2026-08').set(s.auth).send({ expectedIncome: '1000000' }).expect(200);

    const sep = await summary(s, '2026-09');
    expect(sep.body.commitments.items).toEqual([]);
    expect(sep.body.spent.cash).toBe('10.00');
    expect(sep.body.income).toMatchObject({ source: 'carried', total: '1000000.00' });
    expect(sep.body.pending.needsPlan).toBe(true);

    const oct = await summary(s, '2026-10');
    expect(oct.body.commitments.items).toHaveLength(1);
    expect(oct.body.spent.cash).toBe('0.00');

    await api().get('/insights/summary?month=2026-13').set(s.auth).expect(400);
  });
});
