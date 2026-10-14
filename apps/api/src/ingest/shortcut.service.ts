import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import {
  looksLikeSecurityCode,
  normalizeMerchant,
  type ParsedNotification,
  parseArs,
  parseNotification,
  type ShortcutEvent,
  type ShortcutResult,
} from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { IngestProcessor } from './ingest.processor.js';
import { type IngestDevice } from './ingest-token.service.js';
import { CAPTURE_UNAVAILABLE, RawEventCrypto } from './raw-event-crypto.js';

const RAW_EVENT_TTL_MS = 30 * 86_400_000;
/** Apple Pay says nothing about debit or credit: the user confirms (below auto-confirm). */
const APPLE_PAY_CONFIDENCE = 0.8;

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * iPhone Shortcuts (Phase 6, ADR 016). iOS does not let apps read other apps'
 * notifications, so a personal automation forwards what it can: the text of a bank SMS or
 * notification, or the fields of an Apple Pay transaction. Same storage and pipeline as
 * Android: encrypted RawEvent (channel IOS_SHORTCUT, 30 days), templates, then Claude.
 */
@Injectable()
export class ShortcutService {
  private readonly logger = new Logger(ShortcutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: RawEventCrypto,
    private readonly processor: IngestProcessor,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** The catalog source named in the sender, the card or the text (longest name wins). */
  private async sourceOf(
    ...hints: (string | undefined)[]
  ): Promise<{ id: string; name: string } | null> {
    const haystack = fold(hints.filter(Boolean).join('\n'));
    if (!haystack) return null;
    const sources = await this.prisma.source.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });
    return (
      sources
        .filter((s) => haystack.includes(fold(s.name)))
        .sort((a, b) => b.name.length - a.name.length)[0] ?? null
    );
  }

  async receive(device: IngestDevice, event: ShortcutEvent): Promise<ShortcutResult> {
    if (!this.crypto.enabled)
      throw new ServiceUnavailableException({ message: CAPTURE_UNAVAILABLE });
    const text = event.text ?? '';
    // One-time codes and PINs are secrets: never stored, never sent to Claude.
    if (event.kind === 'message' && looksLikeSecurityCode(text)) {
      this.logger.log('shortcut.security_code_dropped');
      return { outcome: 'ignored' };
    }

    const now = this.clock.now();
    // A Shortcut may run twice for one message: same content in the same minute is one event.
    const postedAt = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    const externalKey = createHash('sha256')
      .update(
        [event.kind, text, event.amount ?? '', event.merchant ?? '', event.card ?? ''].join('|'),
      )
      .digest('hex');
    let raw;
    try {
      raw = await this.prisma.rawEvent.create({
        data: {
          userId: device.userId,
          deviceId: device.deviceId,
          channel: 'IOS_SHORTCUT',
          externalKey,
          postedAt,
          receivedAt: now,
          expiresAt: new Date(now.getTime() + RAW_EVENT_TTL_MS),
          ...this.crypto.encrypt(device.userId, event),
        },
        select: { id: true, userId: true, postedAt: true },
      });
    } catch (error) {
      if (isUniqueViolation(error)) return { outcome: 'duplicate' };
      throw error;
    }

    try {
      const outcome =
        event.kind === 'apple_pay'
          ? await this.applePay(raw, event)
          : await this.message(raw, event);
      this.logger.log(`shortcut.${outcome} event=${raw.id} kind=${event.kind}`);
      return { outcome };
    } catch (error) {
      await this.processor.finish(raw.id, 'FAILED', error instanceof Error ? error.name : 'Error');
      this.logger.error(`shortcut.failed event=${raw.id}`);
      throw new ServiceUnavailableException({
        message: 'No pudimos leerlo ahora. Probá más tarde.',
      });
    }
  }

  private async applePay(
    raw: { id: string; userId: string; postedAt: Date },
    event: ShortcutEvent,
  ): Promise<'movement' | 'ignored'> {
    const amount = parseArs(event.amount ?? '');
    if (!amount || amount.startsWith('-') || !/[1-9]/.test(amount)) {
      await this.processor.finish(raw.id, 'UNRECOGNIZED', 'bad_amount');
      return 'ignored';
    }
    const card = event.card ?? '';
    const source = await this.sourceOf(card);
    const merchantRaw = event.merchant?.slice(0, 500) || null;
    const parsed: ParsedNotification = {
      amount,
      currency: /US\$|U\$S|USD/i.test(event.amount ?? '') ? 'USD' : 'ARS',
      direction: 'OUT',
      method: /d[eé]bito|debit/i.test(card) ? 'DEBIT' : 'CREDIT',
      merchantRaw,
      merchantNorm: normalizeMerchant(merchantRaw),
      confidence: APPLE_PAY_CONFIDENCE,
      templateId: 'apple_pay',
    };
    await this.processor.createMovement(raw, source?.id ?? null, parsed, 'TEMPLATE');
    return 'movement';
  }

  private async message(
    raw: { id: string; userId: string; postedAt: Date },
    event: ShortcutEvent,
  ): Promise<'movement' | 'ignored'> {
    const text = event.text ?? '';
    const source = await this.sourceOf(event.sender, text);
    if (source) {
      const parsed = parseNotification(text, await this.processor.templatesFor(source.id));
      if (parsed) {
        await this.processor.createMovement(raw, source.id, parsed, 'TEMPLATE');
        return 'movement';
      }
    }
    const extracted = await this.processor.fallback(
      raw,
      source?.name ??
        (event.sender
          ? `${event.sender} (SMS o notificación en iPhone)`
          : 'SMS o notificación en iPhone'),
      text,
    );
    if (typeof extracted === 'string') {
      await this.processor.finish(raw.id, 'UNRECOGNIZED', extracted);
      return 'ignored';
    }
    await this.processor.createMovement(raw, source?.id ?? null, extracted, 'LLM');
    return 'movement';
  }
}
