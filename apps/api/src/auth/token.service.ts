import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { type AuthTokens } from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { type Env } from '../config/env.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DAY_MS, JWT_AUDIENCE, JWT_ISSUER, REFRESH_REUSE_GRACE_MS } from './auth.constants.js';

const SESSION_EXPIRED = 'Tu sesión venció. Entrá de nuevo.';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);
  private readonly accessTtlSeconds: number;
  private readonly refreshTtlMs: number;
  private readonly familyMaxMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService<Env, true>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.accessTtlSeconds = config.get('JWT_ACCESS_TTL_SECONDS', { infer: true });
    this.refreshTtlMs = config.get('REFRESH_TTL_DAYS', { infer: true }) * DAY_MS;
    this.familyMaxMs = config.get('REFRESH_FAMILY_MAX_DAYS', { infer: true }) * DAY_MS;
  }

  static hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  /** New login = new family. Several devices coexist, each with its own family. */
  async issueSession(userId: string, deviceId: string | null): Promise<AuthTokens> {
    const now = this.clock.now();
    const familyId = randomUUID();
    return this.mint({ userId, deviceId, familyId, familyCreatedAt: now, id: randomUUID() }, now);
  }

  /**
   * Rotation is one conditional UPDATE: only the request that claims the row
   * mints new tokens. A token replayed within the grace window is a network
   * retry (401, nothing revoked); later than that it is reuse and the whole
   * family dies.
   */
  async rotate(rawRefreshToken: string): Promise<AuthTokens> {
    const now = this.clock.now();
    const tokenHash = TokenService.hashToken(rawRefreshToken);
    const nextId = randomUUID();

    const claimed = await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now, replacedById: nextId },
    });

    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!row) throw new UnauthorizedException({ message: SESSION_EXPIRED });

    if (claimed.count === 1) {
      if (row.familyCreatedAt.getTime() + this.familyMaxMs <= now.getTime()) {
        await this.revokeFamily(row.familyId, now);
        throw new UnauthorizedException({ message: SESSION_EXPIRED });
      }
      const tokens = await this.mint(
        {
          id: nextId,
          userId: row.userId,
          deviceId: row.deviceId,
          familyId: row.familyId,
          familyCreatedAt: row.familyCreatedAt,
        },
        now,
      );
      this.logger.log('refresh.rotated');
      return tokens;
    }

    const revokedAt = row.revokedAt?.getTime();
    if (revokedAt !== undefined && now.getTime() - revokedAt < REFRESH_REUSE_GRACE_MS) {
      throw new UnauthorizedException({ message: SESSION_EXPIRED });
    }
    if (revokedAt !== undefined) {
      await this.revokeFamily(row.familyId, now);
      this.logger.warn('refresh.reuse_detected');
    }
    throw new UnauthorizedException({ message: SESSION_EXPIRED });
  }

  /** Idempotent: unknown tokens are ignored. */
  async logout(rawRefreshToken: string): Promise<void> {
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: TokenService.hashToken(rawRefreshToken) },
      select: { familyId: true },
    });
    if (row) await this.revokeFamily(row.familyId, this.clock.now());
  }

  async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }

  private async mint(
    token: {
      id: string;
      userId: string;
      deviceId: string | null;
      familyId: string;
      familyCreatedAt: Date;
    },
    now: Date,
  ): Promise<AuthTokens> {
    const raw = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        id: token.id,
        userId: token.userId,
        deviceId: token.deviceId,
        familyId: token.familyId,
        familyCreatedAt: token.familyCreatedAt,
        tokenHash: TokenService.hashToken(raw),
        expiresAt: new Date(now.getTime() + this.refreshTtlMs),
      },
    });
    const accessToken = await this.jwt.signAsync(
      { sid: token.familyId },
      {
        subject: token.userId,
        expiresIn: this.accessTtlSeconds,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      },
    );
    return { accessToken, accessExpiresInSeconds: this.accessTtlSeconds, refreshToken: raw };
  }
}
