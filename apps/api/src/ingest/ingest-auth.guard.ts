import {
  applyDecorators,
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';

import { Public } from '../auth/public.decorator.js';
import { type IngestDevice, IngestTokenService } from './ingest-token.service.js';

interface IngestRequest {
  headers: { authorization?: string };
  ingestDevice?: IngestDevice;
}

@Injectable()
export class IngestAuthGuard implements CanActivate {
  constructor(private readonly tokens: IngestTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IngestRequest>();
    const [scheme, token] = (request.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();
    const device = await this.tokens.verify(token);
    if (!device) throw new UnauthorizedException();
    request.ingestDevice = device;
    return true;
  }
}

/** Route authorized by a device ingest token instead of a user session. */
export const IngestAuth = (): MethodDecorator & ClassDecorator =>
  applyDecorators(Public(), UseGuards(IngestAuthGuard), ApiBearerAuth());

export const CurrentIngestDevice = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): IngestDevice => {
    const request = ctx.switchToHttp().getRequest<IngestRequest>();
    if (!request.ingestDevice) throw new Error('CurrentIngestDevice used without IngestAuth');
    return request.ingestDevice;
  },
);
