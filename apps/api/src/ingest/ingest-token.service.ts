import { createHash, randomBytes } from 'node:crypto';

import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type IngestToken } from '@findemes/shared';

import { type AuthUser } from '../auth/current-user.decorator.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { type Env } from '../config/env.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';

const PREFIX = 'fdi_';
const DAY_MS = 86_400_000;

export interface IngestDevice {
  deviceId: string;
  userId: string;
}

/**
 * Device-scoped credential for the native uploader (ADR 009). It never grants a session:
 * only /ingest/*. Stored as sha256; replaced on every issue; cleared on logout, reuse
 * detection, account deletion and when capture is turned off. A token older than twice
 * the rotation period stops working, so a lost phone stops uploading on its own.
 */
@Injectable()
export class IngestTokenService {
  private readonly logger = new Logger(IngestTokenService.name);
  private readonly rotateDays: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    this.rotateDays = config.get('INGEST_TOKEN_ROTATE_DAYS', { infer: true });
  }

  static hash(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private async deviceOf(user: AuthUser): Promise<string> {
    const row = await this.prisma.refreshToken.findFirst({
      where: { familyId: user.familyId, userId: user.id, deviceId: { not: null } },
      select: { deviceId: true },
    });
    if (!row?.deviceId) {
      throw new ConflictException({
        message: 'Cerrá sesión y volvé a entrar para activar la captura.',
      });
    }
    return row.deviceId;
  }

  async issue(user: AuthUser): Promise<IngestToken> {
    const deviceId = await this.deviceOf(user);
    const token = `${PREFIX}${randomBytes(32).toString('base64url')}`;
    const now = this.clock.now();
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { ingestTokenHash: IngestTokenService.hash(token), ingestTokenIssuedAt: now },
    });
    this.logger.log(`ingest.token_issued device=${deviceId}`);
    return { token, issuedAt: now.toISOString(), rotateAfterDays: this.rotateDays };
  }

  async revoke(user: AuthUser): Promise<void> {
    const deviceId = await this.deviceOf(user);
    await this.revokeDevice(deviceId);
  }

  async revokeDevice(deviceId: string): Promise<void> {
    await this.prisma.device.updateMany({
      where: { id: deviceId },
      data: { ingestTokenHash: null, ingestTokenIssuedAt: null, listenerEnabled: false },
    });
  }

  async verify(raw: string): Promise<IngestDevice | null> {
    if (!raw.startsWith(PREFIX)) return null;
    const device = await this.prisma.device.findUnique({
      where: { ingestTokenHash: IngestTokenService.hash(raw) },
      select: { id: true, userId: true, ingestTokenIssuedAt: true },
    });
    if (!device?.ingestTokenIssuedAt) return null;
    const maxAgeMs = 2 * this.rotateDays * DAY_MS;
    if (this.clock.now().getTime() - device.ingestTokenIssuedAt.getTime() > maxAgeMs) return null;
    return { deviceId: device.id, userId: device.userId };
  }
}
