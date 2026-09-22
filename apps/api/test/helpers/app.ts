import { type Server } from 'node:http';

import { type INestApplication } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';

import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { CLOCK } from '../../src/common/clock.js';
import { FakeMailProvider } from '../../src/mail/fake-mail.provider.js';
import { MAIL_PROVIDER } from '../../src/mail/mail.provider.js';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { FakeClock } from './clock.js';
import { assertLocalDatabase } from './db.js';

export interface TestApp {
  app: INestApplication<Server>;
  prisma: PrismaService;
  /** The mail provider is always the fake one in tests: read login codes from it. */
  mail: FakeMailProvider;
  /** Move time forward for token expiry and grace windows. */
  clock: FakeClock;
  close: () => Promise<void>;
}

export interface CreateTestAppOptions {
  /** supertest always calls from 127.0.0.1, so rate limiting is off unless a test asks for it. */
  throttling?: boolean;
  /** Extra overrides on the testing module (mocks, fakes). */
  customize?: (builder: TestingModuleBuilder) => TestingModuleBuilder;
}

/** Boots the real AppModule through `configureApp`, exactly like `main.ts` does. */
export async function createTestApp(options: CreateTestAppOptions = {}): Promise<TestApp> {
  assertLocalDatabase();

  const clock = new FakeClock();
  const mail = new FakeMailProvider();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CLOCK)
    .useValue(clock)
    .overrideProvider(MAIL_PROVIDER)
    .useValue(mail);
  if (!options.throttling) {
    builder = builder.overrideProvider(ThrottlerGuard).useValue({ canActivate: () => true });
  }
  if (options.customize) builder = options.customize(builder);

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();

  return {
    app,
    prisma: app.get(PrismaService),
    mail,
    clock,
    close: () => app.close(),
  };
}
