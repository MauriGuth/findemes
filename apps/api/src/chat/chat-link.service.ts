import { randomInt } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type ChatChannel, type ChatLink } from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { type Env } from '../config/env.schema.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

/** No 0/O, 1/I/L: easy to type from the screen if the deep link does not open. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const CODE_TTL_MS = 30 * 60_000;
/** Wrong codes from one chat before it is ignored for an hour (guessing a live code). */
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 3_600_000;

/**
 * Linking a Telegram chat or WhatsApp number to an account (ADR 014): the app shows a
 * single-use code (8 characters, 30 minutes) that the user sends from that chat.
 */
@Injectable()
export class ChatLinkService {
  private readonly logger = new Logger(ChatLinkService.name);
  private readonly failures = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  get telegramEnabled(): boolean {
    return Boolean(this.config.get('TELEGRAM_BOT_TOKEN', { infer: true }));
  }

  get whatsappEnabled(): boolean {
    return Boolean(this.config.get('WHATSAPP_ACCESS_TOKEN', { infer: true }));
  }

  /** The current code, renewed when missing or about to expire. */
  private async code(userId: string): Promise<string> {
    const now = this.clock.now();
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { chatLinkCode: true, chatLinkCodeExpiresAt: true },
    });
    if (
      user.chatLinkCode &&
      user.chatLinkCodeExpiresAt &&
      user.chatLinkCodeExpiresAt.getTime() - now.getTime() > 5 * 60_000
    ) {
      return user.chatLinkCode;
    }
    for (let attempt = 0; ; attempt += 1) {
      const code = Array.from(
        { length: CODE_LENGTH },
        () => ALPHABET[randomInt(ALPHABET.length)],
      ).join('');
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            chatLinkCode: code,
            chatLinkCodeExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
          },
        });
        return code;
      } catch (error) {
        const collision =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!collision || attempt >= 3) throw error;
      }
    }
  }

  async status(userId: string): Promise<ChatLink> {
    const links = await this.prisma.chatLink.findMany({
      where: { userId },
      select: { channel: true },
    });
    const linked = new Set(links.map((link) => link.channel));
    const needsCode =
      (this.telegramEnabled && !linked.has('TELEGRAM')) ||
      (this.whatsappEnabled && !linked.has('WHATSAPP'));
    const code = needsCode ? await this.code(userId) : null;
    const username = this.config.get('TELEGRAM_BOT_USERNAME', { infer: true });
    const number = this.config.get('WHATSAPP_DISPLAY_NUMBER', { infer: true });
    return {
      telegram: {
        available: this.telegramEnabled,
        linked: linked.has('TELEGRAM'),
        url:
          this.telegramEnabled && code && !linked.has('TELEGRAM')
            ? `https://t.me/${username ?? ''}?start=${code}`
            : null,
      },
      whatsapp: {
        available: this.whatsappEnabled,
        linked: linked.has('WHATSAPP'),
        number: this.whatsappEnabled && number ? `+${number}` : null,
        message:
          this.whatsappEnabled && code && !linked.has('WHATSAPP') ? `vincular ${code}` : null,
      },
    };
  }

  async unlink(userId: string, channel: ChatChannel): Promise<void> {
    await this.prisma.chatLink.deleteMany({ where: { userId, channel } });
    this.logger.log(`chat.unlinked channel=${channel}`);
  }

  async userFor(channel: ChatChannel, externalId: string): Promise<string | null> {
    const link = await this.prisma.chatLink.findUnique({
      where: { channel_externalId: { channel, externalId } },
      select: { userId: true },
    });
    return link?.userId ?? null;
  }

  /** A code-looking word in the message, if any. */
  static findCode(text: string): string | null {
    const match = new RegExp(`\\b[${ALPHABET}]{${String(CODE_LENGTH)}}\\b`).exec(
      text.toUpperCase(),
    );
    return match?.[0] ?? null;
  }

  /**
   * Links the chat when the code is live. A chat already linked to another account moves
   * to this one (the person proved access to both). Returns the user id or null.
   */
  async linkByCode(channel: ChatChannel, externalId: string, code: string): Promise<string | null> {
    const now = this.clock.now();
    const key = `${channel}:${externalId}`;
    const recent = (this.failures.get(key) ?? []).filter(
      (t) => now.getTime() - t < FAILURE_WINDOW_MS,
    );
    if (recent.length >= MAX_FAILURES) return null;
    // Counted before the lookup, so a burst of parallel guesses cannot dodge the lockout;
    // a right code clears it below.
    this.failures.set(key, [...recent, now.getTime()]);
    if (this.failures.size > 10_000) {
      const oldest = this.failures.keys().next().value;
      if (oldest !== undefined) this.failures.delete(oldest);
    }

    const user = await this.prisma.user.findFirst({
      where: { chatLinkCode: code, chatLinkCodeExpiresAt: { gt: now } },
      select: { id: true },
    });
    if (!user) {
      this.logger.log(`chat.link_failed channel=${channel}`);
      return null;
    }
    await this.prisma.$transaction([
      this.prisma.chatLink.deleteMany({
        where: {
          OR: [
            { channel, externalId },
            { userId: user.id, channel },
          ],
        },
      }),
      this.prisma.chatLink.create({ data: { userId: user.id, channel, externalId } }),
      // Single use: the next status() issues a new one for the other channel.
      this.prisma.user.update({
        where: { id: user.id },
        data: { chatLinkCode: null, chatLinkCodeExpiresAt: null },
      }),
    ]);
    this.failures.delete(key);
    this.logger.log(`chat.linked channel=${channel}`);
    return user.id;
  }
}
