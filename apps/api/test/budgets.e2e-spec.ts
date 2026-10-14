import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { type FakeLlmProvider } from '../src/llm/fake-llm.provider.js';
import { LLM_PROVIDER } from '../src/llm/llm.provider.js';
import { AlertsService } from '../src/push/alerts.service.js';
import { type FakePushSender, PUSH_SENDER } from '../src/push/push.sender.js';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type TestSession } from './helpers/auth.js';
import { cleanupE2eData } from './helpers/db.js';
import { createE2eSource, type E2eSource } from './helpers/ingest.js';

// SYNTHETIC movements; push goes to the in-process fake sender.
describe('budgets, stats and push alerts (e2e)', () => {
  let ctx: TestApp;
  let push: FakePushSender;
  let alerts: AlertsService;
  let source: E2eSource;
  let supermercado: string;
  let comida: string;
  let keySeq = 0;

  beforeAll(async () => {
    ctx = await createTestApp();
    push = ctx.app.get<FakePushSender>(PUSH_SENDER);
    alerts = ctx.app.get(AlertsService);
    ctx.app.get<FakeLlmProvider>(LLM_PROVIDER).reset();
    source = await createE2eSource(ctx.prisma);
    const categories = await ctx.prisma.category.findMany({ where: { userId: null } });
    supermercado = categories.find((c) => c.slug === 'supermercado')?.id ?? '';
    comida = categories.find((c) => c.slug === 'comida')?.id ?? '';
  });

  beforeEach(() => {
    ctx.clock.set(new Date('2026-10-14T15:00:00Z'));
    push.sent.length = 0;
  });

  afterAll(async () => {
    await cleanupE2eData(ctx.prisma);
    await ctx.close();
  });

  const api = () => request(ctx.app.getHttpServer());
  const token = (n: number) => `ExponentPushToken[e2e-${String(process.pid)}-${String(n)}]`;

  const spend = (session: TestSession, amount: string, extra: Record<string, unknown> = {}) =>
    api()
      .post('/transactions')
      .set(session.auth)
      .send({ amount, method: 'DEBIT', ...extra })
      .expect(201);

  it('budgets show what was spent in the category and alert once at 80% and at 100%', async () => {
    const session = await loginAs(ctx);
    await api()
      .put('/devices/current/push-token')
      .set(session.auth)
      .send({ token: token(1) })
      .expect(204);

    const created = await api()
      .put('/budgets')
      .set(session.auth)
      .send({ categoryId: supermercado, amount: '100000.00' })
      .expect(200);
    expect(created.body).toMatchObject({ spent: '0.00', remaining: '100000.00', ratio: 0 });

    await spend(session, '50000.00', { categoryId: supermercado });
    await spend(session, '9999.00', { categoryId: comida });
    await alerts.drain();
    expect(push.sent).toHaveLength(0);

    await spend(session, '35000.00', { categoryId: supermercado });
    await alerts.drain();
    expect(push.sent).toHaveLength(1);
    expect(push.sent[0]).toMatchObject({ to: token(1), title: 'Usaste el 80% de Supermercado' });

    await spend(session, '1000.00', { categoryId: supermercado });
    await alerts.drain();
    expect(push.sent).toHaveLength(1);

    await spend(session, '20000.00', { categoryId: supermercado });
    await alerts.drain();
    expect(push.sent.at(-1)?.title).toBe('Te pasaste del presupuesto de Supermercado');

    const list = await api().get('/budgets').set(session.auth).expect(200);
    expect(list.body).toMatchObject({
      month: '2026-10',
      items: [{ spent: '106000.00', remaining: '-6000.00', ratio: 1.06 }],
    });

    await api()
      .delete(`/budgets/${created.body.id as string}`)
      .set(session.auth)
      .expect(204);
    expect((await api().get('/budgets').set(session.auth)).body.items).toEqual([]);
  });

  it('stats: daily average, categories and the previous period', async () => {
    const session = await loginAs(ctx);
    await spend(session, '60000.00', {
      categoryId: supermercado,
      occurredAt: '2026-10-10T12:00:00-03:00',
    });
    await spend(session, '40000.00', { occurredAt: '2026-10-12T12:00:00-03:00' });
    await spend(session, '50000.00', { occurredAt: '2026-09-03T12:00:00-03:00' });
    const stats = await api().get('/insights/stats').set(session.auth).expect(200);
    expect(stats.body).toMatchObject({
      month: '2026-10',
      spent: '100000.00',
      dailyAverage: '7142.86',
      topWeekday: { weekday: 6, amount: '60000.00' },
      previous: { month: '2026-09', sameDays: '50000.00', change: 1 },
    });
    expect(stats.body.byCategory[0]).toMatchObject({ categoryId: supermercado, share: 0.6 });
  });

  it('a detected payment and an income are pushed; pushAlerts off silences them', async () => {
    const session = await loginAs(ctx);
    await api()
      .put('/devices/current/push-token')
      .set(session.auth)
      .send({ token: token(2) })
      .expect(204);
    const ingest = await api().post('/devices/current/ingest-token').set(session.auth).expect(201);
    const send = (text: string) => {
      keySeq += 1;
      return api()
        .post('/ingest/notifications')
        .set({ Authorization: `Bearer ${ingest.body.token as string}` })
        .send({
          items: [
            {
              key: `0|${source.packageName}|p${String(keySeq)}|null|10001`,
              packageName: source.packageName,
              postedAt: ctx.clock.now().toISOString(),
              title: null,
              text,
            },
          ],
        })
        .expect(200);
    };

    await send('E2E GASTO $1.500 EN Kiosco Pepito');
    await send('E2E RECIBISTE $250.000');
    await alerts.drain();
    expect(push.sent.map((m) => m.title)).toEqual([
      'Gastaste $1.500,00 en Kiosco Pepito',
      'Te entraron $250.000,00',
    ]);
    expect(push.sent[1]?.data).toEqual({ url: '/(app)/pending' });

    await api().patch('/me').set(session.auth).send({ pushAlerts: false }).expect(200);
    await send('E2E GASTO $2.500 EN Kiosco Pepito');
    await alerts.drain();
    expect(push.sent).toHaveLength(2);
  });

  it('the push token is validated and moves with the phone', async () => {
    const a = await loginAs(ctx);
    const b = await loginAs(ctx);
    await api().put('/devices/current/push-token').set(a.auth).send({ token: 'nope' }).expect(400);
    await api()
      .put('/devices/current/push-token')
      .set(a.auth)
      .send({ token: token(3) })
      .expect(204);
    await api()
      .put('/devices/current/push-token')
      .set(b.auth)
      .send({ token: token(3) })
      .expect(204);
    const holders = await ctx.prisma.device.findMany({ where: { pushToken: token(3) } });
    expect(holders.map((d) => d.userId)).toEqual([b.userId]);
    await api().put('/devices/current/push-token').set(b.auth).send({ token: null }).expect(204);
    expect(await ctx.prisma.device.count({ where: { pushToken: token(3) } })).toBe(0);
  });
});
