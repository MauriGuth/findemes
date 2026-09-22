import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type TestSession } from './helpers/auth.js';
import { cleanupE2eData } from './helpers/db.js';

describe('plans and commitments (e2e)', () => {
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

  it('upserts a plan and reads it back on the same month (DATE columns)', async () => {
    await api().get('/plans/2026-10').set(session.auth).expect(404);
    const created = await api()
      .put('/plans/2026-10')
      .set(session.auth)
      .send({ expectedIncome: '1500000' })
      .expect(200);
    expect(created.body).toMatchObject({
      month: '2026-10',
      expectedIncome: '1500000.00',
      currency: 'ARS',
      salaryTransactionId: null,
    });
    const read = await api().get('/plans/2026-10').set(session.auth).expect(200);
    expect(read.body.id).toBe(created.body.id);
    const updated = await api()
      .put('/plans/2026-10')
      .set(session.auth)
      .send({ expectedIncome: '1600000' })
      .expect(200);
    expect(updated.body).toMatchObject({ id: created.body.id, expectedIncome: '1600000.00' });
    await api().put('/plans/2026-10').set(session.auth).send({ expectedIncome: '-1' }).expect(400);
  });

  it('links a salary from any month, confirms it, and rejects what cannot be a salary', async () => {
    const s = await loginAs(ctx);
    const tx = (body: object) => api().post('/transactions').set(s.auth).send(body);
    const pendingIncome = await tx({
      amount: '1480000',
      method: 'TRANSFER',
      direction: 'IN',
      occurredAt: '2026-09-30T20:00:00Z',
    }).expect(201);
    expect(pendingIncome.body.status).toBe('PENDING');

    const plan = await api()
      .put('/plans/2026-10')
      .set(s.auth)
      .send({ expectedIncome: '1500000', salaryTransactionId: pendingIncome.body.id })
      .expect(200);
    expect(plan.body.salaryTransactionId).toBe(pendingIncome.body.id);
    const confirmed = await api()
      .get(`/transactions/${pendingIncome.body.id}`)
      .set(s.auth)
      .expect(200);
    expect(confirmed.body).toMatchObject({ status: 'CONFIRMED', isSalary: true });

    // Moving it to another month's plan takes it away from October.
    await api()
      .put('/plans/2026-11')
      .set(s.auth)
      .send({ expectedIncome: '1500000', salaryTransactionId: pendingIncome.body.id })
      .expect(200);
    expect(
      (await api().get('/plans/2026-10').set(s.auth).expect(200)).body.salaryTransactionId,
    ).toBeNull();

    const expense = await tx({ amount: '5', method: 'DEBIT' }).expect(201);
    const own = await tx({
      amount: '5',
      method: 'TRANSFER',
      direction: 'IN',
      isOwnTransfer: true,
    }).expect(201);
    const ignored = await tx({
      amount: '5',
      method: 'TRANSFER',
      direction: 'IN',
      status: 'IGNORED',
    }).expect(201);
    for (const id of [expense.body.id, own.body.id, ignored.body.id]) {
      const bad = await api()
        .put('/plans/2026-10')
        .set(s.auth)
        .send({ expectedIncome: '1', salaryTransactionId: id })
        .expect(400);
      expect(bad.body.issues[0].path).toBe('salaryTransactionId');
    }
    const cleared = await api()
      .put('/plans/2026-11')
      .set(s.auth)
      .send({ expectedIncome: '1500000', salaryTransactionId: null })
      .expect(200);
    expect(cleared.body.salaryTransactionId).toBeNull();
  });

  it('derives installment ends and defaults startsOn to the current month', async () => {
    const s = await loginAs(ctx);
    const installment = await api()
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
    expect(installment.body).toMatchObject({
      startsOn: '2026-06',
      endsOn: '2026-11',
      method: 'DEBIT',
      currency: 'ARS',
      active: true,
    });

    const longer = await api()
      .patch(`/commitments/${installment.body.id}`)
      .set(s.auth)
      .send({ installmentsTotal: 12 })
      .expect(200);
    expect(longer.body.endsOn).toBe('2027-05');

    const rent = await api()
      .post('/commitments')
      .set(s.auth)
      .send({ kind: 'RENT', name: 'Alquiler', amount: '450000', dayOfMonth: 10 })
      .expect(201);
    expect(rent.body).toMatchObject({ startsOn: '2026-09', endsOn: null });

    const missing = await api()
      .post('/commitments')
      .set(s.auth)
      .send({ kind: 'INSTALLMENT', name: 'x', amount: '1', dayOfMonth: 1 })
      .expect(400);
    expect(missing.body.issues).toEqual([
      { path: 'installmentsTotal', message: '¿Cuántas cuotas son?' },
    ]);

    // Ending it before it started (in its first month) pauses it instead of corrupting the range.
    const paused = await api()
      .patch(`/commitments/${rent.body.id}`)
      .set(s.auth)
      .send({ endsOn: '2026-08' })
      .expect(200);
    expect(paused.body).toMatchObject({ active: false, endsOn: null });
    const ended = await api()
      .patch(`/commitments/${rent.body.id}`)
      .set(s.auth)
      .send({ active: true, endsOn: '2026-12' })
      .expect(200);
    expect(ended.body).toMatchObject({ active: true, endsOn: '2026-12' });

    const list = await api().get('/commitments').set(s.auth).expect(200);
    expect(list.body.items.map((c: { name: string }) => c.name)).toEqual(['Alquiler', 'Heladera']);
  });

  it('records "Pagué" with the commitment defaults, once per month, and survives deleting the commitment', async () => {
    const s = await loginAs(ctx);
    const rent = await api()
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

    const payment = await api()
      .post(`/commitments/${rent.body.id}/payments`)
      .set(s.auth)
      .send({})
      .expect(201);
    expect(payment.body).toMatchObject({
      direction: 'OUT',
      amount: '450000.00',
      method: 'DEBIT',
      merchantRaw: 'Alquiler',
      status: 'CONFIRMED',
      commitmentId: rent.body.id,
      commitmentMonth: '2026-09',
    });
    const again = await api()
      .post(`/commitments/${rent.body.id}/payments`)
      .set(s.auth)
      .send({})
      .expect(409);
    expect(again.body.message).toBe('Ese compromiso ya figura pagado ese mes.');

    const late = await api()
      .post(`/commitments/${rent.body.id}/payments`)
      .set(s.auth)
      .send({ commitmentMonth: '2026-08', method: 'WALLET' })
      .expect(201);
    expect(late.body).toMatchObject({ commitmentMonth: '2026-08', method: 'WALLET' });

    // A partial payment does not settle the month.
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
    await api()
      .post(`/commitments/${cuota.body.id}/payments`)
      .set(s.auth)
      .send({ amount: '60000' })
      .expect(201);
    await api()
      .post(`/commitments/${cuota.body.id}/payments`)
      .set(s.auth)
      .send({ amount: '40000' })
      .expect(201);
    await api()
      .post(`/commitments/${cuota.body.id}/payments`)
      .set(s.auth)
      .send({ amount: '1' })
      .expect(409);

    await api().delete(`/commitments/${rent.body.id}`).set(s.auth).expect(204);
    const orphan = await api().get(`/transactions/${payment.body.id}`).set(s.auth).expect(200);
    expect(orphan.body.commitmentId).toBeNull();
    await api().get(`/commitments/${rent.body.id}`).set(s.auth).expect(404);
  });
});
