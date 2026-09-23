import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedCatalog } from '../src/seed/catalog.seed.js';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type TestSession } from './helpers/auth.js';

describe('catalog (e2e)', () => {
  let ctx: TestApp;
  let session: TestSession;

  beforeAll(async () => {
    ctx = await createTestApp();
    session = await loginAs(ctx);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('seeds idempotently', async () => {
    const first = await seedCatalog(ctx.prisma);
    const second = await seedCatalog(ctx.prisma);
    expect(first).toEqual({ sources: 16, categories: 16, templates: 0 });
    expect(second).toEqual(first);
  });

  it('publishes template versions from the repo and deactivates removed ones', async () => {
    // SYNTHETIC template attached to a seeded source, only to exercise versioning.
    const definition = {
      source: 'mercado-pago',
      name: 'e2e-sync',
      confidence: 0.9,
      pattern: String.raw`^E2E SYNC \$(?<amount>[\d.,]+)`,
      fieldMap: { direction: 'OUT', method: 'WALLET' },
    } as const;
    const rows = () =>
      ctx.prisma.parserTemplate.findMany({
        where: { name: 'e2e-sync' },
        orderBy: { version: 'asc' },
        select: { version: true, active: true },
      });
    try {
      expect((await seedCatalog(ctx.prisma, [definition])).templates).toBe(1);
      await seedCatalog(ctx.prisma, [definition]);
      expect(await rows()).toEqual([{ version: 1, active: true }]);

      await seedCatalog(ctx.prisma, [{ ...definition, confidence: 0.95 }]);
      expect(await rows()).toEqual([
        { version: 1, active: false },
        { version: 2, active: true },
      ]);

      expect((await seedCatalog(ctx.prisma, [])).templates).toBe(0);
      expect(await rows()).toEqual([
        { version: 1, active: false },
        { version: 2, active: false },
      ]);
    } finally {
      await ctx.prisma.parserTemplate.deleteMany({ where: { name: 'e2e-sync' } });
    }
  });

  it('lists the sources without package names', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/catalog/sources')
      .set(session.auth)
      .expect(200);
    expect(response.body).toHaveLength(16);
    expect(response.body[0]).toEqual({
      id: expect.any(String),
      slug: expect.any(String),
      name: expect.any(String),
      kind: expect.stringMatching(/^(BANK|WALLET|CARD)$/),
      active: true,
    });
    expect(response.body.map((s: { slug: string }) => s.slug)).toContain('bpn');
  });

  it('lists the system categories in display order', async () => {
    const response = await request(ctx.app.getHttpServer())
      .get('/catalog/categories')
      .set(session.auth)
      .expect(200);
    expect(response.body).toHaveLength(16);
    expect(response.body[0]).toMatchObject({ slug: 'supermercado', icon: '🛒', userId: null });
    expect(response.body.at(-1)).toMatchObject({ slug: 'otros' });
  });
});
