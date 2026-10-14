import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { AlertsService } from '../src/push/alerts.service.js';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type TestSession } from './helpers/auth.js';
import { cleanupE2eData } from './helpers/db.js';

// SYNTHETIC movements only.
describe('beta: suggestions, export, legal pages, retention (e2e)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  beforeEach(() => {
    ctx.clock.set(new Date('2026-10-14T15:00:00Z'));
  });

  afterAll(async () => {
    await ctx.app.get(AlertsService).drain();
    await cleanupE2eData(ctx.prisma);
    await ctx.close();
  });

  const api = () => request(ctx.app.getHttpServer());
  const spend = (session: TestSession, body: Record<string, unknown>) =>
    api()
      .post('/transactions')
      .set(session.auth)
      .send({ method: 'CREDIT', ...body })
      .expect(201);

  it('suggests a monthly payment as a commitment until added or dismissed', async () => {
    const session = await loginAs(ctx);
    for (const month of ['07', '08', '09', '10']) {
      await spend(session, {
        amount: '9000.00',
        merchantRaw: 'Streaming SA',
        occurredAt: `2026-${month}-05T12:00:00-03:00`,
      });
    }
    const list = await api().get('/suggestions/commitments').set(session.auth).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      name: 'Streaming SA',
      amount: '9000.00',
      dayOfMonth: 5,
      method: 'CREDIT',
      months: 4,
    });

    await api()
      .post('/suggestions/commitments/dismiss')
      .set(session.auth)
      .send({ key: list.body.items[0].key })
      .expect(204);
    expect((await api().get('/suggestions/commitments').set(session.auth)).body.items).toEqual([]);
  });

  it('exports the movements as CSV for Excel', async () => {
    const session = await loginAs(ctx);
    await spend(session, {
      amount: '1234.56',
      method: 'DEBIT',
      merchantRaw: '=HYPERLINK("x")',
      occurredAt: '2026-10-10T09:30:00-03:00',
    });
    await spend(session, { amount: '99.00', occurredAt: '2026-08-10T12:00:00-03:00' });
    const res = await api()
      .get('/exports/transactions.csv?from=2026-09&to=2026-10')
      .set(session.auth)
      .expect(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.text.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toMatch(/^Fecha;Hora;Tipo;Monto;Moneda;Medio;Comercio/);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      `2026-10-10;09:30;Gasto;1234,56;ARS;Débito;"'=HYPERLINK(""x"")";;;Confirmado;A mano;No;`,
    );
    await api()
      .get('/exports/transactions.csv?from=2026-10&to=2026-09')
      .set(session.auth)
      .expect(400);
    await api().get('/exports/transactions.csv?from=2026-10&to=2026-10').expect(401);
  });

  it('serves the privacy policy and the account deletion page without login', async () => {
    const privacy = await api().get('/legal/privacy').expect(200);
    expect(privacy.headers['content-type']).toContain('text/html');
    expect(privacy.text).toContain('Política de privacidad de Findemes');
    expect(privacy.text).toContain('privacidad@findemes.test');
    const page = await api().get('/legal/delete-account').expect(200);
    expect(page.text).toContain('/legal/delete-account.js');
    const script = await api().get('/legal/delete-account.js').expect(200);
    expect(script.headers['content-type']).toContain('javascript');
  });

  it('the web deletion flow works with the login code and DELETE /me', async () => {
    const session = await loginAs(ctx);
    // What the page's script does after the user types the code.
    await api().delete('/me').set(session.auth).expect(204);
    expect(await ctx.prisma.user.count({ where: { id: session.userId } })).toBe(0);
  });

  it('records daily activity and reports weekly retention behind the admin token', async () => {
    const session = await loginAs(ctx);
    await api().get('/me').set(session.auth).expect(200);
    await api().get('/me').set(session.auth).expect(200);
    await new Promise((r) => setTimeout(r, 50));
    const days = await ctx.prisma.activityDay.findMany({ where: { userId: session.userId } });
    expect(days).toHaveLength(1);

    await api().get('/admin/retention').expect(401);
    const res = await api()
      .get('/admin/retention')
      .set('x-admin-token', process.env['ADMIN_TOKEN'] ?? '')
      .expect(200);
    expect(res.body.users).toBeGreaterThan(0);
    expect(Array.isArray(res.body.cohorts)).toBe(true);
    expect(Array.isArray(res.body.weeklyActive)).toBe(true);
  });
});
