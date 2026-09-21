import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter.js';

describe('GET /health (e2e)', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports the process and the database as up', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body).toMatchObject({
      status: 'ok',
      info: {
        database: { status: 'up' },
        app: { status: 'up', version: expect.any(String) },
      },
    });
  });

  it('answers unknown routes with a Spanish 404', async () => {
    const response = await request(app.getHttpServer()).get('/nope').expect(404);
    expect(response.body).toMatchObject({
      statusCode: 404,
      message: 'No encontramos lo que buscás.',
    });
  });
});
