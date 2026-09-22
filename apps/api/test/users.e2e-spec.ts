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
