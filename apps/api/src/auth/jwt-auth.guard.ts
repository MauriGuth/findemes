import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { CLOCK, type Clock } from '../common/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { IS_PUBLIC_KEY, JWT_AUDIENCE, JWT_ISSUER } from './auth.constants.js';
import { type AuthUser } from './current-user.decorator.js';

interface AccessPayload {
  sub: string;
  sid: string;
}

/**
 * Bearer JWT + live session: the token must verify AND its refresh-token family
 * must still be alive, so logout, reuse detection and account deletion cut
 * access immediately instead of after the access TTL.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<{ headers: { authorization?: string }; user?: AuthUser }>();
    const header = request.headers.authorization ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();

    let payload: AccessPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessPayload>(token, {
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
    } catch {
      throw new UnauthorizedException();
    }
    if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string')
      throw new UnauthorizedException();

    const session = await this.prisma.refreshToken.findFirst({
      where: {
        familyId: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: this.clock.now() },
      },
      select: { id: true },
    });
    if (!session) throw new UnauthorizedException();

    request.user = { id: payload.sub, familyId: payload.sid };
    return true;
  }
}
