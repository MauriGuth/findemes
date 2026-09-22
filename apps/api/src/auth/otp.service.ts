import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';

import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dayRange, todayInArt } from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { type Env } from '../config/env.schema.js';
import { MAIL_PROVIDER, type MailProvider } from '../mail/mail.provider.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DAY_MS,
  HOUR_MS,
  OTP_MAX_ATTEMPTS_PER_CODE,
  OTP_MAX_FAILED_PER_EMAIL_PER_DAY,
  OTP_MAX_LIVE_CODES_PER_EMAIL,
  OTP_MAX_SENDS_PER_EMAIL_PER_DAY,
  OTP_MAX_SENDS_PER_EMAIL_PER_HOUR,
} from './auth.constants.js';

const CODE_WRONG = 'Código incorrecto. Revisá el mail.';
const CODE_DEAD = 'Ese código ya no sirve. Pedí uno nuevo.';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly pepper: string;
  private readonly ttlMs: number;
  private readonly globalDailyCap: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
    @Inject(MAIL_PROVIDER) private readonly mail: MailProvider,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.pepper = config.get('OTP_PEPPER', { infer: true });
    this.ttlMs = config.get('OTP_TTL_MINUTES', { infer: true }) * 60_000;
    this.globalDailyCap = config.get('OTP_GLOBAL_DAILY_CAP', { infer: true });
  }

  generateCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  hashCode(email: string, code: string): string {
    return createHmac('sha256', this.pepper).update(`${email}\n${code}`).digest('hex');
  }

  /** Creates and sends a code. Never reveals whether the email has an account. */
  async requestCode(email: string): Promise<void> {
    const now = this.clock.now();
    const hourAgo = new Date(now.getTime() - HOUR_MS);
    const dayAgo = new Date(now.getTime() - DAY_MS);
    const today = dayRange(todayInArt(now));

    const [perHour, perDay, global] = await Promise.all([
      this.prisma.loginCode.count({ where: { email, createdAt: { gt: hourAgo } } }),
      this.prisma.loginCode.count({ where: { email, createdAt: { gt: dayAgo } } }),
      this.prisma.loginCode.count({ where: { createdAt: { gte: today.start, lt: today.end } } }),
    ]);
    if (perHour >= OTP_MAX_SENDS_PER_EMAIL_PER_HOUR || perDay >= OTP_MAX_SENDS_PER_EMAIL_PER_DAY) {
      this.logger.warn('otp.rate_limited');
      throw new HttpException(
        { message: 'Ya te mandamos varios códigos. Esperá unos minutos y revisá el mail.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (global >= this.globalDailyCap) {
      this.logger.error('otp.global_cap');
      throw new HttpException(
        { message: 'No podemos mandar más códigos por hoy. Probá mañana.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Opportunistic purge of codes that expired more than a day ago.
    await this.prisma.loginCode.deleteMany({ where: { expiresAt: { lt: dayAgo } } });

    const code = this.generateCode();
    const created = await this.prisma.loginCode.create({
      data: {
        email,
        codeHash: this.hashCode(email, code),
        expiresAt: new Date(now.getTime() + this.ttlMs),
      },
      select: { id: true },
    });

    // Asking for a new code never kills the one just received; only the oldest beyond the cap.
    const live = await this.prisma.loginCode.findMany({
      where: { email, consumedAt: null, expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    const stale = live.slice(OTP_MAX_LIVE_CODES_PER_EMAIL).map((row) => row.id);
    if (stale.length > 0) {
      await this.prisma.loginCode.updateMany({
        where: { id: { in: stale } },
        data: { consumedAt: now },
      });
    }

    try {
      await this.mail.send({
        to: email,
        subject: `${code} es tu código de Findemes`,
        text: [
          `Tu código para entrar a Findemes es ${code}.`,
          '',
          `Vence en ${String(Math.round(this.ttlMs / 60_000))} minutos.`,
          'Si no lo pediste, ignorá este mail: nadie puede entrar sin el código.',
        ].join('\n'),
      });
    } catch (error) {
      await this.prisma.loginCode.delete({ where: { id: created.id } });
      this.logger.error(`otp.send_failed ${error instanceof Error ? error.name : 'unknown'}`);
      throw new ServiceUnavailableException({
        message: 'No pudimos mandarte el código. Probá en un rato.',
      });
    }
    this.logger.log('otp.requested');
  }

  /** Throws 401 (wrong / dead code) or 429 (daily failure budget). Consumes every live code on success. */
  async verifyCode(email: string, code: string): Promise<void> {
    const now = this.clock.now();
    const dayAgo = new Date(now.getTime() - DAY_MS);

    const failed = await this.prisma.loginCode.aggregate({
      _sum: { attempts: true },
      where: { email, createdAt: { gt: dayAgo } },
    });
    if ((failed._sum.attempts ?? 0) >= OTP_MAX_FAILED_PER_EMAIL_PER_DAY) {
      this.logger.warn('otp.rate_limited');
      throw new HttpException(
        { message: 'Demasiados intentos con este mail. Probá mañana.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const live = await this.prisma.loginCode.findMany({
      where: {
        email,
        consumedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: OTP_MAX_ATTEMPTS_PER_CODE },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, codeHash: true },
    });
    const newest = live[0];
    if (!newest) throw new UnauthorizedException({ message: CODE_DEAD });

    // Count the attempt before comparing, atomically, so concurrent guesses cannot exceed the cap.
    const claimed = await this.prisma.loginCode.updateMany({
      where: {
        id: newest.id,
        consumedAt: null,
        expiresAt: { gt: now },
        attempts: { lt: OTP_MAX_ATTEMPTS_PER_CODE },
      },
      data: { attempts: { increment: 1 } },
    });
    if (claimed.count === 0) throw new UnauthorizedException({ message: CODE_DEAD });

    const expected = Buffer.from(this.hashCode(email, code), 'hex');
    const match = live.some((row) => {
      const actual = Buffer.from(row.codeHash, 'hex');
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    });
    if (!match) {
      this.logger.warn('otp.failed');
      throw new UnauthorizedException({ message: CODE_WRONG });
    }

    await this.prisma.loginCode.updateMany({
      where: { email, consumedAt: null },
      data: { consumedAt: now },
    });
    this.logger.log('otp.verified');
  }
}
