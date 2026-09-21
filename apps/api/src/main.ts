import 'reflect-metadata';

import { Logger, StandardSchemaValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { type Env } from './config/env.schema.js';
import { APP_VERSION } from './version.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService<Env, true>);
  const logger = new Logger('Bootstrap');

  // Railway and most PaaS terminate TLS in front of the app: trust the first proxy
  // so rate limiting sees the client IP instead of the load balancer's.
  app.set('trust proxy', 1);
  app.use(helmet());

  const corsOrigins = config.get('CORS_ORIGINS', { infer: true });
  if (corsOrigins.length > 0) {
    app.enableCors({ origin: corsOrigins, credentials: true });
  }

  // zod (Standard Schema) validation: `@Body({ schema })`, `@Query({ schema })`, ...
  app.useGlobalPipes(new StandardSchemaValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    const document = new DocumentBuilder()
      .setTitle('Findemes API')
      .setDescription('Backend for Findemes: automatic expense capture for Argentina.')
      .setVersion(APP_VERSION)
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, () => SwaggerModule.createDocument(app, document));
  }

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  logger.log(`Findemes API v${APP_VERSION} listening on port ${String(port)}`);
}

await bootstrap();
