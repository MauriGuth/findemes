import {
  BadRequestException,
  StandardSchemaValidationPipe,
  type StandardSchemaValidationPipeOptions,
} from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';

import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';

export interface ValidationIssue {
  path: string;
  message: string;
}

type StandardIssues = Parameters<
  NonNullable<StandardSchemaValidationPipeOptions['exceptionFactory']>
>[0];

/** Flattens Standard Schema issues into `{ path: 'a.b', message }` the app can show per field. */
export function toValidationIssues(issues: StandardIssues): ValidationIssue[] {
  return issues.map((issue) => ({
    path: (issue.path ?? [])
      .map((segment) =>
        String(typeof segment === 'object' && segment !== null ? segment.key : segment),
      )
      .join('.'),
    message: issue.message,
  }));
}

/**
 * Everything the HTTP layer needs, shared by `main.ts` and the e2e tests so
 * tests exercise the same pipes and filters as production.
 */
export function configureApp(app: NestExpressApplication): void {
  // Railway and most PaaS terminate TLS in front of the app: trust the first proxy
  // so rate limiting sees the client IP instead of the load balancer's.
  app.set('trust proxy', 1);
  app.use(helmet());

  // Inbound email webhooks carry PDF attachments (ADR 013): a large JSON limit only there.
  // Registering json parsers here replaces Nest's default one, so the 100 kB parser for
  // every other route is declared explicitly right after.
  app.useBodyParser('json', {
    limit: '40mb',
    type: (req: { url?: string; headers: { 'content-type'?: string } }) =>
      (req.url ?? '').startsWith('/inbound/') &&
      (req.headers['content-type'] ?? '').includes('json'),
  });
  // WhatsApp signs the exact bytes it sends (X-Hub-Signature-256): keep them for the check.
  // Nest passes the options through to Express's json parser, `verify` included.
  const whatsappParser = {
    limit: '1mb',
    type: (req: { url?: string; headers: { 'content-type'?: string } }) =>
      (req.url ?? '').startsWith('/chat/whatsapp') &&
      (req.headers['content-type'] ?? '').includes('json'),
    verify: (req: { rawBody?: Buffer }, _res: unknown, buf: Buffer) => {
      req.rawBody = Buffer.from(buf);
    },
  };
  app.useBodyParser('json', whatsappParser);
  app.useBodyParser('json', { limit: '100kb' });

  // zod (Standard Schema) validation: `@Body({ schema })`, `@Query({ schema })`, ...
  app.useGlobalPipes(
    new StandardSchemaValidationPipe({
      exceptionFactory: (issues) =>
        new BadRequestException({
          message: 'Revisá los datos que mandaste.',
          issues: toValidationIssues(issues),
        }),
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.enableShutdownHooks();
}
