import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedCatalog } from '../src/seed/catalog.seed.js';
import { createTestApp, type TestApp } from './helpers/app.js';

describe('catalog (e2e)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('seeds idempotently', async () => {
    const first = await seedCatalog(ctx.prisma);
    const second = await seedCatalog(ctx.prisma);
    expect(first).toEqual({ sources: 16, categories: 16 });
    expect(second).toEqual(first);
  });

  it('lists the sources without package names', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/catalog/sources').expect(200);
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
    const response = await request(ctx.app.getHttpServer()).get('/catalog/categories').expect(200);
    expect(response.body).toHaveLength(16);
    expect(response.body[0]).toMatchObject({ slug: 'supermercado', icon: '🛒', userId: null });
    expect(response.body.at(-1)).toMatchObject({ slug: 'otros' });
  });
});
