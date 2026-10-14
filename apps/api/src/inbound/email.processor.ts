import { createHash } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  type BillKind,
  type Currency,
  dayRange,
  formatIsoDate,
  normalizeMerchant,
  type ParsedNotification,
  todayInArt,
  toArtCalendarDate,
} from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { isoToDate } from '../common/dto.js';
import { type Env } from '../config/env.schema.js';
import { Prisma } from '../generated/prisma/client.js';
import { IngestProcessor } from '../ingest/ingest.processor.js';
import { RawEventCrypto } from '../ingest/raw-event-crypto.js';
import {
  costMicros,
  type EmailExtraction,
  LLM_PROVIDER,
  type LlmProvider,
} from '../llm/llm.provider.js';
import { PrismaService } from '../prisma/prisma.service.js';

export interface EmailPayload {
  from: string;
  subject: string;
  text: string;
  pdfs: { name: string; base64: string }[];
}

/** Whatever Claude reads is reviewed by the user (below AUTO_CONFIRM_CONFIDENCE). */
const LLM_CONFIDENCE = 0.7;
/** A bank email can arrive a day after the payment a manual entry recorded. */
const EMAIL_MANUAL_WINDOW_MS = 24 * 3_600_000;
const AMOUNT = /^\d{1,15}(\.\d{1,2})?$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH = /^\d{4}-\d{2}$/;

function money(value: string | null | undefined): string | null {
  if (!value || !AMOUNT.test(value.trim())) return null;
  const amount = Number(value);
  return amount > 0 ? new Prisma.Decimal(value.trim()).toFixed(2) : null;
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * Turns one stored email into a movement or a bill (ADR 013). Logs carry ids and outcomes,
 * never text, senders or amounts.
 */
@Injectable()
export class EmailProcessor {
  private readonly logger = new Logger(EmailProcessor.name);
  private readonly dailyCap: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: RawEventCrypto,
    private readonly movements: IngestProcessor,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider | null,
    @Inject(CLOCK) private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    this.dailyCap = config.get('EMAIL_LLM_DAILY_CAP', { infer: true });
  }

  async process(rawEventId: string): Promise<void> {
    const raw = await this.prisma.rawEvent.findUnique({ where: { id: rawEventId } });
    if (!raw || raw.channel !== 'EMAIL') return;
    if (raw.status === 'PROCESSED' || raw.status === 'UNRECOGNIZED') return;

    try {
      if (!this.llm) {
        await this.movements.finish(raw.id, 'UNRECOGNIZED', 'no_llm');
        return;
      }
      const today = dayRange(todayInArt(this.clock.now()));
      const used = await this.prisma.llmUsage.count({
        where: {
          userId: raw.userId,
          purpose: 'email',
          createdAt: { gte: today.start, lt: today.end },
          outcome: { not: 'error' },
        },
      });
      if (used >= this.dailyCap) {
        // Stays RECEIVED: a later webhook retries it once the cap resets.
        await this.prisma.rawEvent.update({
          where: { id: raw.id },
          data: { error: 'llm_cap', processedAt: this.clock.now() },
        });
        this.logger.log(`inbound.llm_cap event=${raw.id}`);
        return;
      }

      const payload = this.crypto.decrypt<EmailPayload>(raw.userId, raw);
      const record = (
        outcome: string,
        usage: { model: string; inputTokens: number; outputTokens: number },
      ) =>
        this.prisma.llmUsage.create({
          data: {
            userId: raw.userId,
            rawEventId: raw.id,
            purpose: 'email',
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
        result = await this.llm.extractEmail({
          ...payload,
          receivedOn: formatIsoDate(toArtCalendarDate(raw.postedAt)),
        });
      } catch (error) {
        await record('error', { model: this.llm.name, inputTokens: 0, outputTokens: 0 });
        throw error;
      }

      const outcome = await this.apply(raw, result.value);
      await record(outcome === 'not_financial' ? 'not_financial' : 'parsed', result);
    } catch (error) {
      await this.movements.finish(raw.id, 'FAILED', error instanceof Error ? error.name : 'Error');
      this.logger.error(`inbound.failed event=${raw.id}`);
    }
  }

  private async apply(
    raw: { id: string; userId: string; postedAt: Date },
    extraction: EmailExtraction,
  ): Promise<'movement' | 'bill' | 'not_financial'> {
    if (extraction.kind === 'movement' && extraction.movement) {
      const m = extraction.movement;
      const amount = money(m.amount);
      if (amount) {
        const merchantRaw = m.merchant?.trim().slice(0, 500) || null;
        const parsed: ParsedNotification = {
          amount,
          currency: m.currency,
          direction: m.direction,
          method: m.method,
          merchantRaw,
          merchantNorm: normalizeMerchant(merchantRaw),
          confidence: LLM_CONFIDENCE,
          templateId: 'llm',
        };
        await this.movements.createMovement(raw, null, parsed, 'LLM', {
          occurredAt: this.occurredAt(m.occurredAt, raw.postedAt),
          manualWindowMs: EMAIL_MANUAL_WINDOW_MS,
        });
        return 'movement';
      }
    }
    if (extraction.kind === 'card_statement' && extraction.statement) {
      const s = extraction.statement;
      const created = await this.createBill(raw, {
        kind: 'CARD_STATEMENT',
        issuer: s.issuer,
        amount: money(s.total),
        minimumAmount: money(s.minimum),
        currency: s.currency,
        dueOn: s.dueOn,
        periodMonth: null,
      });
      if (created) return 'bill';
    }
    if (extraction.kind === 'bill' && extraction.bill) {
      const b = extraction.bill;
      const created = await this.createBill(raw, {
        kind: b.kind,
        issuer: b.issuer,
        amount: money(b.amount),
        minimumAmount: null,
        currency: b.currency,
        dueOn: b.dueOn,
        periodMonth: b.periodMonth,
      });
      if (created) return 'bill';
    }
    await this.movements.finish(raw.id, 'UNRECOGNIZED', 'not_financial');
    this.logger.log(`inbound.unrecognized event=${raw.id}`);
    return 'not_financial';
  }

  /** The email's own date when plausible (within 7 days before it arrived), else arrival. */
  private occurredAt(value: string | null, postedAt: Date): Date {
    if (!value) return postedAt;
    const parsed = new Date(ISO_DATE.test(value) ? `${value}T12:00:00-03:00` : value);
    if (Number.isNaN(parsed.getTime())) return postedAt;
    const age = postedAt.getTime() - parsed.getTime();
    return age >= 0 && age <= 7 * 86_400_000 ? parsed : postedAt;
  }

  private async createBill(
    raw: { id: string; userId: string; postedAt: Date },
    bill: {
      kind: BillKind;
      issuer: string;
      amount: string | null;
      minimumAmount: string | null;
      currency: Currency;
      dueOn: string;
      periodMonth: string | null;
    },
  ): Promise<boolean> {
    const issuer = bill.issuer.trim().slice(0, 120);
    if (!bill.amount || !issuer || !ISO_DATE.test(bill.dueOn)) return false;
    const due = isoToDate(bill.dueOn);
    const days = (due.getTime() - raw.postedAt.getTime()) / 86_400_000;
    if (Number.isNaN(days) || days < -120 || days > 400) return false;

    const issuerNorm = normalizeMerchant(issuer) ?? issuer.toUpperCase();
    const fingerprint = createHash('sha256')
      .update([raw.userId, bill.kind, issuerNorm, bill.amount, bill.dueOn].join('|'))
      .digest('hex');
    try {
      await this.prisma.$transaction([
        this.prisma.bill.create({
          data: {
            userId: raw.userId,
            kind: bill.kind,
            issuer,
            issuerNorm,
            amount: new Prisma.Decimal(bill.amount),
            minimumAmount: bill.minimumAmount ? new Prisma.Decimal(bill.minimumAmount) : null,
            currency: bill.currency,
            dueOn: due,
            periodMonth:
              bill.periodMonth && MONTH.test(bill.periodMonth)
                ? isoToDate(`${bill.periodMonth}-01`)
                : null,
            status: 'PENDING',
            origin: 'EMAIL',
            fingerprint,
            rawEventId: raw.id,
          },
        }),
        this.prisma.rawEvent.update({
          where: { id: raw.id },
          data: { status: 'PROCESSED', error: null, processedAt: this.clock.now() },
        }),
      ]);
      this.logger.log(`inbound.bill event=${raw.id} kind=${bill.kind}`);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      await this.movements.finish(raw.id, 'PROCESSED', 'duplicate');
      this.logger.log(`inbound.duplicate_bill event=${raw.id}`);
    }
    return true;
  }
}
