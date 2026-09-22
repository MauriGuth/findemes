import { Inject, Injectable, Logger } from '@nestjs/common';
import { type AuthSession, type AuthTokens, type DeviceInfo } from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toUserDto } from '../users/user.dto.js';
import { OtpService } from './otp.service.js';
import { TokenService } from './token.service.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  requestCode(email: string): Promise<void> {
    return this.otp.requestCode(email);
  }

  /** Signup is the first successful login. */
  async verifyCode(email: string, code: string, device: DeviceInfo): Promise<AuthSession> {
    await this.otp.verifyCode(email, code);
    const now = this.clock.now();

    const user = await this.prisma.user.upsert({
      where: { email },
      create: { email },
      update: {},
    });

    const known = device.id
      ? await this.prisma.device.findFirst({
          where: { id: device.id, userId: user.id },
          select: { id: true },
        })
      : null;
    const deviceRow = known
      ? await this.prisma.device.update({
          where: { id: known.id },
          data: {
            platform: device.platform,
            appVersion: device.appVersion ?? null,
            name: device.name ?? null,
            lastSeenAt: now,
          },
          select: { id: true },
        })
      : await this.prisma.device.create({
          data: {
            userId: user.id,
            platform: device.platform,
            appVersion: device.appVersion ?? null,
            name: device.name ?? null,
            lastSeenAt: now,
          },
          select: { id: true },
        });

    const tokens = await this.tokens.issueSession(user.id, deviceRow.id);
    this.logger.log('auth.login');
    return { ...tokens, deviceId: deviceRow.id, user: toUserDto(user) };
  }

  refresh(refreshToken: string): Promise<AuthTokens> {
    return this.tokens.rotate(refreshToken);
  }

  logout(refreshToken: string): Promise<void> {
    return this.tokens.logout(refreshToken);
  }
}
