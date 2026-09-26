import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AUTO_CONFIRM_CONFIDENCE,
  dayRange,
  fingerprintInput,
  normalizeMerchant,
  type NotificationParts,
  notificationText,
  type ParsedNotification,
  parseNotification,
  type ParserTemplateData,
  parseArs,
  type TemplateFieldMap,
  todayInArt,
} from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { type Env } from '../config/env.schema.js';
import { Prisma, type TransactionOrigin } from '../generated/prisma/client.js';
import { costMicros, LLM_PROVIDER, type LlmProvider } from '../llm/llm.provider.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RawEventCrypto } from './raw-event-crypto.js';

export type NotificationPayload = Required<{ [K in keyof NotificationParts]: string | null }>;

/** Manual entries within this window with the same amount are flagged as possible duplicates. */
const MANUAL_DUPLICATE_WINDOW_MS = 10 * 60_000;
/** Whatever Claude extracts is always reviewed by the user (below AUTO_CONFIRM_CONFIDENCE). */
const LLM_CONFIDENCE = 0.7;

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

  private readonly llmDailyCap: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: RawEventCrypto,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider | null,
    @Inject(CLOCK) private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    this.llmDailyCap = config.get('LLM_DAILY_CAP', { infer: true });
  }

  async process(rawEventId: string): Promise<void> {
    const raw = await this.prisma.rawEvent.findUnique({ where: { id: rawEventId } });
    if (!raw || raw.status === 'PROCESSED' || raw.status === 'UNRECOGNIZED') return;

    try {
      const source = raw.packageName
        ? await this.prisma.source.findUnique({
            where: { packageName: raw.packageName },
            select: { id: true, name: true },
          })
        : null;
      if (!source) {
        await this.finish(raw.id, 'UNRECOGNIZED', 'unknown_source');
        return;
      }
      const parts = this.crypto.decrypt<NotificationPayload>(raw.userId, raw);
      const text = notificationText(parts);
      const parsed = parseNotification(text, await this.templatesFor(source.id));
      if (parsed) {
        await this.createMovement(raw, source.id, parsed, 'TEMPLATE');
        return;
      }
      const extracted = await this.fallback(raw, source.name, text);
      if (extracted === 'no_llm' || extracted === 'llm_cap' || extracted === 'not_financial') {
        await this.finish(raw.id, 'UNRECOGNIZED', extracted);
        this.logger.log(`ingest.unrecognized event=${raw.id} reason=${extracted}`);
        return;
      }
      await this.createMovement(raw, source.id, extracted, 'LLM');
    } catch (error) {
      await this.finish(raw.id, 'FAILED', error instanceof Error ? error.name : 'Error');
      this.logger.error(`ingest.failed event=${raw.id}`);
    }
  }

  /**
   * Claude reads what no template matched (ADR 010), within the user's daily cap. Every call
   * leaves an LlmUsage row with tokens and cost; errors propagate so the event is FAILED and
   * retried on a later upload.
   */
  private async fallback(
    raw: { id: string; userId: string },
    sourceName: string,
    text: string,
  ): Promise<ParsedNotification | 'no_llm' | 'llm_cap' | 'not_financial'> {
    if (!this.llm) return 'no_llm';
    const today = dayRange(todayInArt(this.clock.now()));
    // Failed calls (outage, timeout) don't use up the cap: otherwise an Anthropic incident
    // plus the retries would leave the day's real payments unrecognized for good.
    const usedToday = await this.prisma.llmUsage.count({
      where: {
        userId: raw.userId,
        createdAt: { gte: today.start, lt: today.end },
        outcome: { not: 'error' },
      },
    });
    if (usedToday >= this.llmDailyCap) return 'llm_cap';

    const record = (
      outcome: 'parsed' | 'not_financial' | 'error',
      usage: { model: string; inputTokens: number; outputTokens: number },
    ) =>
      this.prisma.llmUsage.create({
        data: {
          userId: raw.userId,
          rawEventId: raw.id,
          purpose: 'notification_fallback',
          model: usage.model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costMicros: costMicros(usage.model, usage.inputTokens, usage.outputTokens),
          outcome,
          createdAt: this.clock.now(),
        },
      });

    let result;
    try {
      result = await this.llm.extractNotification({ sourceName, text });
    } catch (error) {
      await record('error', { model: this.llm.name, inputTokens: 0, outputTokens: 0 });
      throw error;
    }
    const { value } = result;
    const amount = value.amount ? parseArs(value.amount) : null;
    const { direction, method } = value;
    if (
      !value.isFinancial ||
      amount === null ||
      amount.startsWith('-') ||
      !/[1-9]/.test(amount) ||
      direction === null ||
      method === null
    ) {
      await record('not_financial', result);
      return 'not_financial';
    }
    await record('parsed', result);

    const merchantRaw = value.merchant?.trim().slice(0, 500) || null;
    return {
      amount,
      currency: value.currency ?? 'ARS',
      direction,
      method,
      merchantRaw,
      merchantNorm: normalizeMerchant(merchantRaw),
      confidence: LLM_CONFIDENCE,
      templateId: 'llm',
    };
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
      data: { status, error, processedAt: this.clock.now() },
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
