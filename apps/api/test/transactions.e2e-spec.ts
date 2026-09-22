import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type TestSession } from './helpers/auth.js';
import { cleanupE2eData } from './helpers/db.js';

describe('transactions (e2e)', () => {
  let ctx: TestApp;
  let session: TestSession;

  beforeAll(async () => {
    ctx = await createTestApp();
    ctx.clock.set(new Date('2026-09-21T15:00:00Z'));
    session = await loginAs(ctx);
  });

  afterAll(async () => {
    await cleanupE2eData(ctx.prisma);
    await ctx.close();
  });

  const api = () => request(ctx.app.getHttpServer());
  const post = (body: object, s: TestSession = session) =>
    api().post('/transactions').set(s.auth).send(body);

  it('confirms expenses at once and leaves unclassified incomes pending', async () => {
    const expense = await post({ amount: '25000', method: 'DEBIT' }).expect(201);
    expect(expense.body).toMatchObject({
      amount: '25000.00',
      direction: 'OUT',
      status: 'CONFIRMED',
      origin: 'MANUAL',
      confidence: 1,
      isSalary: false,
      commitmentMonth: null,
    });
    expect(expense.body.fingerprint).toMatch(/^manual:/);

    const pending = await post({ amount: '200000', method: 'TRANSFER', direction: 'IN' }).expect(
      201,
    );
    expect(pending.body.status).toBe('PENDING');

    const other = await post({
      amount: '50000',
      method: 'TRANSFER',
      direction: 'IN',
      status: 'CONFIRMED',
    }).expect(201);
    expect(other.body.status).toBe('CONFIRMED');

    const own = await post({
      amount: '200000',
      method: 'TRANSFER',
      direction: 'IN',
      isOwnTransfer: true,
    }).expect(201);
    expect(own.body).toMatchObject({ status: 'CONFIRMED', isOwnTransfer: true });
  });

  it('accepts two identical movements', async () => {
    await post({ amount: '1500', method: 'CASH', merchantRaw: 'Café' }).expect(201);
    await post({ amount: '1500', method: 'CASH', merchantRaw: 'Café' }).expect(201);
  });

  it('marks the salary, creating the plan of that month, and only in pesos', async () => {
    const s = await loginAs(ctx);
    const salary = await post(
      {
        amount: '1480000',
        method: 'TRANSFER',
        direction: 'IN',
        markAsSalary: true,
        occurredAt: '2026-09-04T13:00:00Z',
      },
      s,
    ).expect(201);
    expect(salary.body).toMatchObject({ status: 'CONFIRMED', isSalary: true });
    const plan = await api().get('/plans/2026-09').set(s.auth).expect(200);
    expect(plan.body).toMatchObject({
      month: '2026-09',
      expectedIncome: '1480000.00',
      salaryTransactionId: salary.body.id,
    });

    const usd = await post(
      { amount: '1000', method: 'TRANSFER', direction: 'IN', currency: 'USD', markAsSalary: true },
      s,
    ).expect(400);
    expect(usd.body.issues).toEqual([
      { path: 'markAsSalary', message: 'Por ahora el sueldo tiene que ser en pesos' },
    ]);

    // Marking the October salary credited on the 30th of September.
    const october = await post(
      {
        amount: '1500000',
        method: 'TRANSFER',
        direction: 'IN',
        markAsSalary: true,
        salaryMonth: '2026-10',
        occurredAt: '2026-09-30T20:00:00Z',
      },
      s,
    ).expect(201);
    const octPlan = await api().get('/plans/2026-10').set(s.auth).expect(200);
    expect(octPlan.body.salaryTransactionId).toBe(october.body.id);
  });

  it('lists by month with Argentina borders', async () => {
    const s = await loginAs(ctx);
    const late = await post(
      { amount: '10', method: 'CASH', occurredAt: '2026-10-01T02:30:00Z' },
      s,
    ).expect(201);
    const early = await post(
      { amount: '20', method: 'CASH', occurredAt: '2026-10-01T03:00:00Z' },
      s,
    ).expect(201);
    const sep = await api().get('/transactions?month=2026-09').set(s.auth).expect(200);
    const oct = await api().get('/transactions?month=2026-10').set(s.auth).expect(200);
    expect(sep.body.items.map((t: { id: string }) => t.id)).toEqual([late.body.id]);
    expect(oct.body.items.map((t: { id: string }) => t.id)).toEqual([early.body.id]);
    await api().get('/transactions?month=2026-9').set(s.auth).expect(400);
  });

  it('unlinks the salary when the movement stops being an eligible income', async () => {
    const s = await loginAs(ctx);
    const salary = await post(
      { amount: '900000', method: 'TRANSFER', direction: 'IN', markAsSalary: true },
      s,
    ).expect(201);
    const patched = await api()
      .patch(`/transactions/${salary.body.id}`)
      .set(s.auth)
      .send({ direction: 'OUT' })
      .expect(200);
    expect(patched.body.isSalary).toBe(false);
    const plan = await api().get('/plans/2026-09').set(s.auth).expect(200);
    expect(plan.body.salaryTransactionId).toBeNull();
  });

  it('answers 404 for foreign or unknown references and movements', async () => {
    const stranger = await loginAs(ctx);
    const theirs = await post({ amount: '1', method: 'CASH' }, stranger).expect(201);
    await api().get(`/transactions/${theirs.body.id}`).set(session.auth).expect(404);
    await api()
      .patch(`/transactions/${theirs.body.id}`)
      .set(session.auth)
      .send({ note: 'x' })
      .expect(404);
    await api().delete(`/transactions/${theirs.body.id}`).set(session.auth).expect(404);
    await post({ amount: '1', method: 'DEBIT', commitmentId: randomUUID() }).expect(404);
    await post({ amount: '1', method: 'DEBIT', categoryId: randomUUID() }).expect(404);
    const theirCommitment = await api()
      .post('/commitments')
      .set(stranger.auth)
      .send({ kind: 'RENT', name: 'Alquiler', amount: '1', dayOfMonth: 1 })
      .expect(201);
    await post({ amount: '1', method: 'DEBIT', commitmentId: theirCommitment.body.id }).expect(404);
  });

  it('creates only the commitment for a purchase in installments', async () => {
    const s = await loginAs(ctx);
    const before = await api().get('/transactions?month=2026-06').set(s.auth).expect(200);
    const response = await api()
      .post('/transactions/installments')
      .set(s.auth)
      .send({
        total: '600000',
        installments: 6,
        name: 'Heladera',
        occurredAt: '2026-06-15T15:00:00Z',
      })
      .expect(201);
    expect(response.body).toMatchObject({
      kind: 'INSTALLMENT',
      method: 'CREDIT',
      amount: '100000.00',
      dayOfMonth: 15,
      startsOn: '2026-06',
      endsOn: '2026-11',
      installmentsTotal: 6,
      name: 'Heladera',
    });
    const after = await api().get('/transactions?month=2026-06').set(s.auth).expect(200);
    expect(after.body.items).toHaveLength(before.body.items.length as number);
  });

  it('validates in Spanish with per-field issues', async () => {
    const bad = await post({ amount: '0', method: 'CASH' }).expect(400);
    expect(bad.body).toMatchObject({
      message: 'Revisá los datos que mandaste.',
      issues: [{ path: 'amount', message: 'El monto tiene que ser mayor a cero' }],
    });
    await api().patch(`/transactions/${randomUUID()}`).set(session.auth).send({}).expect(400);
  });
});
