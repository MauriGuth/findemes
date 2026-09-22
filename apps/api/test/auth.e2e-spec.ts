import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs } from './helpers/auth.js';
import { cleanupE2eData, e2eEmail } from './helpers/db.js';

const device = { platform: 'ANDROID', appVersion: '0.1.0', name: 'Pixel e2e' };

describe('auth (e2e)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
    await cleanupE2eData(ctx.prisma);
  });

  afterAll(async () => {
    await cleanupE2eData(ctx.prisma);
    await ctx.close();
  });

  const api = () => request(ctx.app.getHttpServer());

  async function requestCode(email: string): Promise<string> {
    await api().post('/auth/request-code').send({ email }).expect(200, { ok: true });
    const code = ctx.mail.lastCodeFor(email);
    if (!code) throw new Error('no code sent');
    return code;
  }

  it('sends a six-digit code and answers the same for any email', async () => {
    const email = e2eEmail('code');
    const code = await requestCode(email);
    expect(code).toMatch(/^\d{6}$/);
    expect(ctx.mail.sent.at(-1)?.subject).toBe(`${code} es tu código de Findemes`);
    await api()
      .post('/auth/request-code')
      .send({ email: e2eEmail('unknown') })
      .expect(200, { ok: true });
  });

  it('normalizes the email so the code matches on both sides', async () => {
    const email = e2eEmail('norm');
    await api()
      .post('/auth/request-code')
      .send({ email: `  ${email.toUpperCase()} ` })
      .expect(200);
    const code = ctx.mail.lastCodeFor(email);
    expect(code).toBeDefined();
    const response = await api()
      .post('/auth/verify-code')
      .send({ email: ` ${email} `, code, device })
      .expect(200);
    expect(response.body.user.email).toBe(email);
  });

  it('creates the user and device on first login and reuses the device afterwards', async () => {
    const email = e2eEmail('first');
    const code = await requestCode(email);
    const first = await api().post('/auth/verify-code').send({ email, code, device }).expect(200);
    expect(first.body).toMatchObject({
      accessToken: expect.any(String),
      accessExpiresInSeconds: 900,
      refreshToken: expect.any(String),
      deviceId: expect.any(String),
      user: { email, name: null, dailyReminderTime: '20:00' },
    });

    const code2 = await requestCode(email);
    const second = await api()
      .post('/auth/verify-code')
      .send({ email, code: code2, device: { ...device, id: first.body.deviceId } })
      .expect(200);
    expect(second.body.deviceId).toBe(first.body.deviceId);
    expect(await ctx.prisma.device.count({ where: { userId: first.body.user.id } })).toBe(1);
  });

  it('never reuses a device that belongs to someone else', async () => {
    const other = await loginAs(ctx);
    const email = e2eEmail('dev');
    const code = await requestCode(email);
    const response = await api()
      .post('/auth/verify-code')
      .send({ email, code, device: { ...device, id: other.deviceId } })
      .expect(200);
    expect(response.body.deviceId).not.toBe(other.deviceId);
  });

  it('rejects wrong codes, kills a code after 5 attempts, and does not invalidate the previous code when a new one is requested', async () => {
    const email = e2eEmail('wrong');
    const code = await requestCode(email);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      const response = await api()
        .post('/auth/verify-code')
        .send({ email, code: wrong, device })
        .expect(401);
      expect(response.body.message).toBe('Código incorrecto. Revisá el mail.');
    }
    const dead = await api().post('/auth/verify-code').send({ email, code, device }).expect(401);
    expect(dead.body.message).toBe('Ese código ya no sirve. Pedí uno nuevo.');

    const first = await requestCode(email);
    const secondCode = await requestCode(email);
    expect(secondCode).not.toBe(first);
    await api().post('/auth/verify-code').send({ email, code: first, device }).expect(200);
  });

  it('expires codes after the TTL', async () => {
    const email = e2eEmail('ttl');
    const code = await requestCode(email);
    ctx.clock.advance(11 * 60_000);
    const response = await api()
      .post('/auth/verify-code')
      .send({ email, code, device })
      .expect(401);
    expect(response.body.message).toBe('Ese código ya no sirve. Pedí uno nuevo.');
    ctx.clock.reset();
  });

  it('caps sends per email and failed attempts per email per day', async () => {
    const email = e2eEmail('caps');
    let last = '';
    for (let round = 0; round < 4; round += 1) {
      last = await requestCode(email);
      const wrong = last === '000000' ? '111111' : '000000';
      for (let i = 0; i < 5; i += 1)
        await api().post('/auth/verify-code').send({ email, code: wrong, device }).expect(401);
    }
    const fifth = await requestCode(email); // 5th send within the hour is still allowed
    const budget = await api()
      .post('/auth/verify-code')
      .send({ email, code: fifth, device })
      .expect(429);
    expect(budget.body.message).toBe('Demasiados intentos con este mail. Probá mañana.');
    const sixth = await api().post('/auth/request-code').send({ email }).expect(429);
    expect(sixth.body.message).toContain('Ya te mandamos varios códigos');
  });

  it('answers 503 and keeps the quota when the mail cannot be sent', async () => {
    const email = e2eEmail('mailfail');
    ctx.mail.failNext = true;
    const response = await api().post('/auth/request-code').send({ email }).expect(503);
    expect(response.body.message).toBe('No pudimos mandarte el código. Probá en un rato.');
    expect(await ctx.prisma.loginCode.count({ where: { email } })).toBe(0);
  });

  it('rotates refresh tokens, tolerates a retry within the grace window, and revokes the family on reuse', async () => {
    const session = await loginAs(ctx);
    const rotated = await api()
      .post('/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(200);
    expect(rotated.body.refreshToken).not.toBe(session.refreshToken);
    await api()
      .get('/catalog/sources')
      .set('Authorization', `Bearer ${rotated.body.accessToken}`)
      .expect(200);

    // Retry with the old token 10 seconds later: 401, but the family survives.
    ctx.clock.advance(10_000);
    await api().post('/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
    await api()
      .get('/catalog/sources')
      .set('Authorization', `Bearer ${rotated.body.accessToken}`)
      .expect(200);

    // Two minutes later the same replay is reuse: everything dies.
    ctx.clock.advance(2 * 60_000);
    const reuse = await api()
      .post('/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(401);
    expect(reuse.body.message).toBe('Tu sesión venció. Entrá de nuevo.');
    await api().post('/auth/refresh').send({ refreshToken: rotated.body.refreshToken }).expect(401);
    await api()
      .get('/catalog/sources')
      .set('Authorization', `Bearer ${rotated.body.accessToken}`)
      .expect(401);
    ctx.clock.reset();
  });

  it('lets exactly one of two concurrent refreshes win', async () => {
    const session = await loginAs(ctx);
    const results = await Promise.all([
      api().post('/auth/refresh').send({ refreshToken: session.refreshToken }),
      api().post('/auth/refresh').send({ refreshToken: session.refreshToken }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  it('ends the session absolutely after the family cap', async () => {
    const session = await loginAs(ctx);
    ctx.clock.advance(181 * 86_400_000);
    await api().post('/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
    ctx.clock.reset();
  });

  it('logout kills the access token immediately and is idempotent', async () => {
    const session = await loginAs(ctx);
    await api().get('/catalog/sources').set(session.auth).expect(200);
    await api().post('/auth/logout').send({ refreshToken: session.refreshToken }).expect(204);
    await api().get('/catalog/sources').set(session.auth).expect(401);
    await api().post('/auth/refresh').send({ refreshToken: session.refreshToken }).expect(401);
    await api().post('/auth/logout').send({ refreshToken: session.refreshToken }).expect(204);
  });

  it('protects routes and validates bodies in Spanish', async () => {
    await api().get('/catalog/sources').expect(401);
    await api().get('/catalog/sources').set('Authorization', 'Bearer nope').expect(401);
    const bad = await api()
      .post('/auth/verify-code')
      .send({ email: 'x', code: '12', device })
      .expect(400);
    expect(bad.body).toMatchObject({
      statusCode: 400,
      message: 'Revisá los datos que mandaste.',
      issues: expect.arrayContaining([
        { path: 'email', message: 'Ese mail no parece válido' },
        { path: 'code', message: 'El código tiene 6 números' },
      ]),
    });
  });
});

describe('auth throttling (e2e)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp({ throttling: true });
  });

  afterAll(async () => {
    await cleanupE2eData(ctx.prisma);
    await ctx.close();
  });

  it('limits request-code per IP', async () => {
    const api = () => request(ctx.app.getHttpServer());
    for (let i = 0; i < 5; i += 1)
      await api()
        .post('/auth/request-code')
        .send({ email: e2eEmail('ip') })
        .expect(200);
    const blocked = await api()
      .post('/auth/request-code')
      .send({ email: e2eEmail('ip') })
      .expect(429);
    expect(blocked.body.message).toBe('Demasiados intentos. Esperá un momento y probá de nuevo.');
  });
});
