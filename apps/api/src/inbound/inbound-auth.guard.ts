import { timingSafeEqual } from 'node:crypto';

import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type Env } from '../config/env.schema.js';

/** Basic auth the inbound provider sends with every webhook (the URL carries user:pass). */
@Injectable()
export class InboundAuthGuard implements CanActivate {
  private readonly expected: Buffer | null;

  constructor(config: ConfigService<Env, true>) {
    const user = config.get('INBOUND_WEBHOOK_USER', { infer: true });
    const password = config.get('INBOUND_WEBHOOK_PASSWORD', { infer: true });
    this.expected =
      config.get('INBOUND_EMAIL_ADDRESS', { infer: true }) && user && password
        ? Buffer.from(`Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`)
        : null;
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.expected) throw new ServiceUnavailableException();
    const header = context.switchToHttp().getRequest<{ headers: { authorization?: string } }>()
      .headers.authorization;
    const given = Buffer.from(header ?? '');
    if (given.length !== this.expected.length || !timingSafeEqual(given, this.expected)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
