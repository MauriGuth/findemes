import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type InboundAddress } from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { type Env } from '../config/env.schema.js';
import { Prisma } from '../generated/prisma/client.js';
import { RawEventCrypto } from '../ingest/raw-event-crypto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { type GmailConfirmation } from './gmail-confirmation.js';

/** No 0/o, 1/l: users may read the address aloud or type it. */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const TOKEN_LENGTH = 12;
export const GMAIL_CONFIRMATION_ERROR = 'gmail_confirmation';
const CONFIRMATION_DAYS = 7;

function newToken(): string {
  return [...randomBytes(TOKEN_LENGTH)].map((b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** The per-user forwarding address `local+token@domain` (ADR 013). */
@Injectable()
export class InboundAddressService {
  private readonly base: { local: string; domain: string } | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: RawEventCrypto,
    @Inject(CLOCK) private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    const address = config.get('INBOUND_EMAIL_ADDRESS', { infer: true });
    const [local, domain] = address?.split('@') ?? [];
    this.base = local && domain ? { local, domain } : null;
  }

  get enabled(): boolean {
    return this.base !== null && this.crypto.enabled;
  }

  /** The token part of an inbound recipient, or null if it is not one of ours. */
  tokenOf(recipient: string | undefined): string | null {
    if (!this.base || !recipient) return null;
    const match = /^([^+@\s<]+)\+([a-z0-9]+)@([^>\s]+)/i.exec(recipient.trim().replace(/^.*</, ''));
    if (!match) return null;
    const [, local, token, domain] = match;
    if (local?.toLowerCase() !== this.base.local.toLowerCase()) return null;
    if (domain?.toLowerCase() !== this.base.domain.toLowerCase()) return null;
    return token?.toLowerCase() ?? null;
  }

  async userByToken(token: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { inboundToken: token },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  private format(token: string): string | null {
    return this.base ? `${this.base.local}+${token}@${this.base.domain}` : null;
  }

  private async assign(userId: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = newToken();
      try {
        await this.prisma.user.update({ where: { id: userId }, data: { inboundToken: token } });
        return token;
      } catch (error) {
        const clash =
          error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!clash) throw error;
      }
    }
    throw new Error('could not assign an inbound token');
  }

  async status(userId: string): Promise<InboundAddress> {
    if (!this.enabled) return { address: null, gmailConfirmation: null, lastEmailAt: null };
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { inboundToken: true },
    });
    const token = user.inboundToken ?? (await this.assign(userId));

    const since = new Date(this.clock.now().getTime() - CONFIRMATION_DAYS * 86_400_000);
    const [confirmation, last] = await Promise.all([
      this.prisma.rawEvent.findFirst({
        where: {
          userId,
          channel: 'EMAIL',
          error: GMAIL_CONFIRMATION_ERROR,
          receivedAt: { gte: since },
        },
        orderBy: { receivedAt: 'desc' },
      }),
      this.prisma.rawEvent.findFirst({
        where: {
          userId,
          channel: 'EMAIL',
          OR: [{ error: null }, { error: { not: GMAIL_CONFIRMATION_ERROR } }],
        },
        orderBy: { receivedAt: 'desc' },
        select: { receivedAt: true },
      }),
    ]);
    let gmailConfirmation: InboundAddress['gmailConfirmation'] = null;
    if (confirmation) {
      const payload = this.crypto.decrypt<{ confirmation: GmailConfirmation }>(
        userId,
        confirmation,
      );
      gmailConfirmation = {
        ...payload.confirmation,
        receivedAt: confirmation.receivedAt.toISOString(),
      };
    }
    return {
      address: this.format(token),
      gmailConfirmation,
      lastEmailAt: last?.receivedAt.toISOString() ?? null,
    };
  }

  /** A new address: mail sent to the old one is dropped from now on. */
  async rotate(userId: string): Promise<InboundAddress> {
    if (this.enabled) await this.assign(userId);
    return this.status(userId);
  }
}
