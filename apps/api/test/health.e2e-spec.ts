import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestApp, type TestApp } from './helpers/app.js';

describe('GET /health (e2e)', () => {
  let ctx: TestApp;

  beforeAll(async () => {
    ctx = await createTestApp();
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('reports the process and the database as up', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/health').expect(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      info: {
        database: { status: 'up' },
        app: { status: 'up', version: expect.any(String) },
      },
    });
  });

  it('answers unknown routes with a Spanish 404', async () => {
    const response = await request(ctx.app.getHttpServer()).get('/nope').expect(404);
    expect(response.body).toMatchObject({
      statusCode: 404,
      message: 'No encontramos lo que buscás.',
    });
  });
});
