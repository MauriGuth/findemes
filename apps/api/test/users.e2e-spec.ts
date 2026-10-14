import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs } from './helpers/auth.js';
import { cleanupE2eData } from './helpers/db.js';

describe('users (e2e)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await cleanupE2eData(ctx.prisma);
    await ctx.close();
  });

  const api = () => request(ctx.app.getHttpServer());

  it('returns and updates the signed-in user', async () => {
    const session = await loginAs(ctx);
    const me = await api().get('/me').set(session.auth).expect(200);
    expect(me.body).toEqual({
      id: session.userId,
      email: session.email,
      name: null,
      dailyReminderTime: '20:00',
      payday: 1,
      pushAlerts: true,
      createdAt: expect.any(String),
    });

    const updated = await api()
      .patch('/me')
      .set(session.auth)
      .send({ name: 'Mauri', dailyReminderTime: '21:15' })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'Mauri', dailyReminderTime: '21:15' });

    const off = await api()
      .patch('/me')
      .set(session.auth)
      .send({ dailyReminderTime: null })
      .expect(200);
    expect(off.body.dailyReminderTime).toBeNull();

    const bad = await api()
      .patch('/me')
      .set(session.auth)
      .send({ dailyReminderTime: '24:00' })
      .expect(400);
    expect(bad.body.issues).toEqual([
      { path: 'dailyReminderTime', message: 'La hora tiene que ser HH:MM' },
    ]);
    await api().patch('/me').set(session.auth).send({}).expect(400);
    await api().patch('/me').set(session.auth).send({ payday: 29 }).expect(400);
  });

  it('with a payday, the month runs from payday to payday ("hasta que cobrés")', async () => {
    ctx.clock.set(new Date('2026-10-14T15:00:00Z'));
    const session = await loginAs(ctx);
    await api().patch('/me').set(session.auth).send({ payday: 5, pushAlerts: false }).expect(200);
    const spend = (amount: string, occurredAt: string) =>
      api()
        .post('/transactions')
        .set(session.auth)
        .send({ amount, method: 'DEBIT', occurredAt })
        .expect(201);
    await spend('1000.00', '2026-10-04T12:00:00-03:00'); // September's period
    await spend('2000.00', '2026-10-05T12:00:00-03:00');
    await spend('4000.00', '2026-11-04T12:00:00-03:00'); // still October's period

    const summary = await api().get('/insights/summary').set(session.auth).expect(200);
    expect(summary.body).toMatchObject({
      month: '2026-10',
      payday: 5,
      periodEnd: '2026-11-05',
      daysLeft: 22,
      spent: { cash: '6000.00' },
    });
    const list = await api().get('/transactions').set(session.auth).expect(200);
    expect(list.body.items).toHaveLength(2);
    const september = await api()
      .get('/insights/summary?month=2026-09')
      .set(session.auth)
      .expect(200);
    expect(september.body.spent.cash).toBe('1000.00');
  });

  it('deletes the account for real and cuts access immediately', async () => {
    const session = await loginAs(ctx);
    await ctx.prisma.loginCode.create({
      data: { email: session.email, codeHash: 'x', expiresAt: new Date(Date.now() + 60_000) },
    });
    await ctx.prisma.commitment.create({
      data: {
        userId: session.userId,
        kind: 'RENT',
        name: 'Alquiler',
        amount: '450000',
        dayOfMonth: 10,
        startsOn: new Date('2026-01-01T00:00:00Z'),
      },
    });

    await api().delete('/me').set(session.auth).expect(204);
    await api().get('/me').set(session.auth).expect(401);
    await api().post('/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);

    expect(await ctx.prisma.user.count({ where: { id: session.userId } })).toBe(0);
    expect(await ctx.prisma.commitment.count({ where: { userId: session.userId } })).toBe(0);
    expect(await ctx.prisma.refreshToken.count({ where: { userId: session.userId } })).toBe(0);
    expect(await ctx.prisma.device.count({ where: { userId: session.userId } })).toBe(0);
    expect(await ctx.prisma.loginCode.count({ where: { email: session.email } })).toBe(0);
  });
});
