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
