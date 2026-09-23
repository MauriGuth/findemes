import { createHash } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import {
  AUTO_CONFIRM_CONFIDENCE,
  fingerprintInput,
  type NotificationParts,
  notificationText,
  type ParsedNotification,
  parseNotification,
  type ParserTemplateData,
  type TemplateFieldMap,
} from '@findemes/shared';

import { Prisma, type TransactionOrigin } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RawEventCrypto } from './raw-event-crypto.js';

export type NotificationPayload = Required<{ [K in keyof NotificationParts]: string | null }>;

/** Manual entries within this window with the same amount are flagged as possible duplicates. */
const MANUAL_DUPLICATE_WINDOW_MS = 10 * 60_000;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Turns one stored notification into a movement (or not). Independent of HTTP so it can
 * move to a queue without changes (ADR 005). Logs carry ids and outcomes, never text.
 */
@Injectable()
export class IngestProcessor {
  private readonly logger = new Logger(IngestProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: RawEventCrypto,
  ) {}

  async process(rawEventId: string): Promise<void> {
    const raw = await this.prisma.rawEvent.findUnique({ where: { id: rawEventId } });
    if (!raw || raw.status === 'PROCESSED' || raw.status === 'UNRECOGNIZED') return;

    try {
      const source = raw.packageName
        ? await this.prisma.source.findUnique({
            where: { packageName: raw.packageName },
            select: { id: true },
          })
        : null;
      if (!source) {
        await this.finish(raw.id, 'UNRECOGNIZED', 'unknown_source');
        return;
      }
      const parts = this.crypto.decrypt<NotificationPayload>(raw.userId, raw);
      const text = notificationText(parts);
      const parsed = parseNotification(text, await this.templatesFor(source.id));
      if (!parsed) {
        await this.finish(raw.id, 'UNRECOGNIZED', 'no_template');
        this.logger.log(`ingest.unrecognized event=${raw.id}`);
        return;
      }
      await this.createMovement(raw, source.id, parsed, 'TEMPLATE');
    } catch (error) {
      await this.finish(raw.id, 'FAILED', error instanceof Error ? error.name : 'Error');
      this.logger.error(`ingest.failed event=${raw.id}`);
    }
  }

  private async templatesFor(sourceId: string): Promise<ParserTemplateData[]> {
    const rows = await this.prisma.parserTemplate.findMany({
      where: { sourceId, active: true },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      pattern: row.pattern,
      priority: row.priority,
      confidence: row.confidence.toNumber(),
      fieldMap: row.fieldMap as unknown as TemplateFieldMap,
    }));
  }

  private async finish(
    id: string,
    status: 'PROCESSED' | 'UNRECOGNIZED' | 'FAILED',
    error: string | null,
  ): Promise<void> {
    await this.prisma.rawEvent.update({
      where: { id },
      data: { status, error, processedAt: new Date() },
    });
  }

  /**
   * Status rules: incomes always wait for the user to classify them (salary / other / own
   * transfer, as in Phase 1); expenses confirm on their own at high confidence, unless a
   * manual entry looks like the same payment, in which case the user decides.
   */
  async createMovement(
    raw: { id: string; userId: string; postedAt: Date },
    sourceId: string,
    parsed: ParsedNotification,
    origin: Extract<TransactionOrigin, 'TEMPLATE' | 'LLM'>,
  ): Promise<void> {
    const occurredAt = raw.postedAt;
    const manualTwin = await this.prisma.transaction.findFirst({
      where: {
        userId: raw.userId,
        origin: 'MANUAL',
        status: { not: 'IGNORED' },
        amount: new Prisma.Decimal(parsed.amount),
        currency: parsed.currency,
        direction: parsed.direction,
        occurredAt: {
          gte: new Date(occurredAt.getTime() - MANUAL_DUPLICATE_WINDOW_MS),
          lte: new Date(occurredAt.getTime() + MANUAL_DUPLICATE_WINDOW_MS),
        },
      },
      select: { id: true },
    });
    const confirmed =
      parsed.direction === 'OUT' && parsed.confidence >= AUTO_CONFIRM_CONFIDENCE && !manualTwin;

    const fingerprint = createHash('sha256')
      .update(
        fingerprintInput({
          userId: raw.userId,
          sourceId,
          amount: parsed.amount,
          occurredAt,
          merchantNorm: parsed.merchantNorm,
        }),
      )
      .digest('hex');

    try {
      await this.prisma.$transaction([
        this.prisma.transaction.create({
          data: {
            userId: raw.userId,
            sourceId,
            amount: new Prisma.Decimal(parsed.amount),
            currency: parsed.currency,
            direction: parsed.direction,
            method: parsed.method,
            merchantRaw: parsed.merchantRaw,
            merchantNorm: parsed.merchantNorm,
            occurredAt,
            status: confirmed ? 'CONFIRMED' : 'PENDING',
            confidence: new Prisma.Decimal(parsed.confidence.toFixed(2)),
            origin,
            fingerprint,
            rawEventId: raw.id,
          },
        }),
        this.prisma.rawEvent.update({
          where: { id: raw.id },
          data: { status: 'PROCESSED', error: null, processedAt: new Date() },
        }),
      ]);
      this.logger.log(
        `ingest.movement event=${raw.id} origin=${origin} confirmed=${String(confirmed)}`,
      );
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      // Same user, source, amount, 2-minute bucket and merchant: the movement already exists.
      await this.finish(raw.id, 'PROCESSED', 'duplicate');
      this.logger.log(`ingest.duplicate event=${raw.id}`);
    }
  }
}
