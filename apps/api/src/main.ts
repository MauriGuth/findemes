import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { type Env } from './config/env.schema.js';
import { APP_VERSION } from './version.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService<Env, true>);
  const logger = new Logger('Bootstrap');

  configureApp(app);

  const corsOrigins = config.get('CORS_ORIGINS', { infer: true });
  if (corsOrigins.length > 0) {
    app.enableCors({ origin: corsOrigins, credentials: true });
  }

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
