import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from './auth/auth.module.js';
import { ClockModule } from './common/clock.js';

import { CatalogModule } from './catalog/catalog.module.js';
import { validateEnv } from './config/env.schema.js';
import { HealthModule } from './health/health.module.js';
import { InsightsModule } from './insights/insights.module.js';
import { MailModule } from './mail/mail.module.js';
import { PlansModule } from './plans/plans.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot({
      // Two named throttlers: routes override the limits they need with @Throttle().
      throttlers: [
        { name: 'minute', ttl: 60_000, limit: 60 },
        { name: 'daily', ttl: 86_400_000, limit: 20_000 },
      ],
      errorMessage: 'Demasiados intentos. Esperá un momento y probá de nuevo.',
    }),
    ClockModule,
    PrismaModule,
    MailModule,
    AuthModule,
    UsersModule,
    HealthModule,
    CatalogModule,
    PlansModule,
    TransactionsModule,
    InsightsModule,
  ],
  // ThrottlerGuard is a plain provider too so tests can override it (overrideGuard cannot reach APP_GUARD).
  providers: [ThrottlerGuard, { provide: APP_GUARD, useExisting: ThrottlerGuard }],
})
export class AppModule {}
