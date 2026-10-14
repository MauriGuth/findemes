import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { looksLikeSecurityCode } from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { RawEventCrypto } from '../ingest/raw-event-crypto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EmailProcessor, type EmailPayload } from './email.processor.js';
import { extractGmailConfirmation, isGmailForwardingConfirmation } from './gmail-confirmation.js';
import { htmlToText } from './html-to-text.js';
import { GMAIL_CONFIRMATION_ERROR, InboundAddressService } from './inbound-address.service.js';
import { type PostmarkInbound } from './postmark.schema.js';

const RAW_EVENT_TTL_MS = 30 * 86_400_000;
const MAX_TEXT_CHARS = 40_000;
const MAX_PDFS = 3;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
/** A FAILED email waits this long before another attempt (Anthropic outage, timeout). */
const RETRY_BACKOFF_MS = 5 * 60_000;
/** An email still RECEIVED this long after arriving lost its processing (deploy, cap). */
const STALE_MS = 10 * 60_000;
/** Retries stop looking further back than this (the event expires at 30 days anyway). */
const RETRY_WINDOW_MS = 3 * 86_400_000;

export type InboundOutcome =
  'stored' | 'duplicate' | 'unknown_recipient' | 'gmail_confirmation' | 'security_code';

/**
 * Forwarded emails (ADR 013): the webhook only stores (encrypted, 30 days) and answers;
 * reading with Claude runs right after, in the background, because a PDF can take longer
 * than the provider waits. Anything that did not finish is retried on later webhooks.
 */
@Injectable()
export class EmailIngestService {
  private readonly logger = new Logger(EmailIngestService.name);
  private readonly inflight = new Set<Promise<void>>();
  /** Events being read right now: concurrent webhooks must not send them to Claude twice. */
  private readonly reading = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: RawEventCrypto,
    private readonly addresses: InboundAddressService,
    private readonly processor: EmailProcessor,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Tests and shutdown: wait for the background reading to finish. */
  async drain(): Promise<void> {
    while (this.inflight.size > 0) await Promise.allSettled([...this.inflight]);
  }

  private track(work: Promise<void>): void {
    const tracked = work
      .catch((error: unknown) => {
        this.logger.error(`inbound.background_error ${error instanceof Error ? error.name : ''}`);
      })
      .finally(() => this.inflight.delete(tracked));
    this.inflight.add(tracked);
  }

  private read(id: string): Promise<void> {
    if (this.reading.has(id)) return Promise.resolve();
    this.reading.add(id);
    return this.processor.process(id).finally(() => this.reading.delete(id));
  }

  private recipientToken(mail: PostmarkInbound): string | null {
    const candidates = [mail.OriginalRecipient, ...(mail.ToFull ?? []).map((to) => to.Email)];
    for (const candidate of candidates) {
      const token = this.addresses.tokenOf(candidate);
      if (token) return token;
    }
    return mail.MailboxHash ? mail.MailboxHash.toLowerCase() : null;
  }

  async receive(mail: PostmarkInbound): Promise<InboundOutcome> {
    if (!this.addresses.enabled) throw new ServiceUnavailableException();
    const now = this.clock.now();
    await this.prisma.rawEvent.deleteMany({ where: { expiresAt: { lt: now } } });

    const token = this.recipientToken(mail);
    const userId = token ? await this.addresses.userByToken(token) : null;
    if (!userId) {
      this.logger.log('inbound.unknown_recipient');
      return 'unknown_recipient';
    }

    const existing = await this.prisma.rawEvent.findFirst({
      where: { userId, channel: 'EMAIL', externalKey: mail.MessageID },
      select: { id: true },
    });
    if (existing) {
      this.retryLater(userId, now);
      return 'duplicate';
    }

    const from = mail.FromFull
      ? `${mail.FromFull.Name ?? ''} <${mail.FromFull.Email}>`.trim()
      : mail.From;
    const text = (mail.TextBody.trim() || htmlToText(mail.HtmlBody)).slice(0, MAX_TEXT_CHARS);
    const parsedDate = mail.Date ? new Date(mail.Date) : null;
    const postedAt = parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : now;
    const base = {
      userId,
      channel: 'EMAIL' as const,
      externalKey: mail.MessageID,
      postedAt,
      receivedAt: now,
      expiresAt: new Date(now.getTime() + RAW_EVENT_TTL_MS),
    };

    if (isGmailForwardingConfirmation(from, mail.Subject)) {
      const confirmation = extractGmailConfirmation(`${text}\n${htmlToText(mail.HtmlBody)}`);
      await this.prisma.rawEvent.create({
        data: {
          ...base,
          ...this.crypto.encrypt(userId, { from, subject: mail.Subject, confirmation, token }),
          status: 'PROCESSED',
          error: GMAIL_CONFIRMATION_ERROR,
          processedAt: now,
        },
      });
      this.logger.log('inbound.gmail_confirmation');
      return 'gmail_confirmation';
    }

    // One-time codes and PINs are secrets: never stored, never sent to Claude.
    if (looksLikeSecurityCode(`${mail.Subject}\n${text.slice(0, 1500)}`)) {
      this.logger.log('inbound.security_code_dropped');
      return 'security_code';
    }

    const pdfs = mail.Attachments.filter(
      (a) =>
        (a.ContentType.toLowerCase() === 'application/pdf' || /\.pdf$/i.test(a.Name)) &&
        a.Content.length > 0 &&
        Math.ceil((a.Content.length * 3) / 4) <= MAX_PDF_BYTES,
    )
      .slice(0, MAX_PDFS)
      .map((a) => ({ name: a.Name.slice(0, 120), base64: a.Content }));

    const payload: EmailPayload = { from, subject: mail.Subject.slice(0, 500), text, pdfs };
    const row = await this.prisma.rawEvent.create({
      data: { ...base, ...this.crypto.encrypt(userId, payload), status: 'RECEIVED' },
      select: { id: true },
    });
    this.logger.log(`inbound.stored event=${row.id} pdfs=${String(pdfs.length)}`);
    this.track(this.read(row.id));
    this.retryLater(userId, now, row.id);
    return 'stored';
  }

  /** A few earlier emails of the same user that failed or never finished. */
  private retryLater(userId: string, now: Date, exceptId?: string): void {
    this.track(
      (async () => {
        const stuck = await this.prisma.rawEvent.findMany({
          where: {
            userId,
            channel: 'EMAIL',
            ...(exceptId ? { id: { not: exceptId } } : {}),
            receivedAt: { gte: new Date(now.getTime() - RETRY_WINDOW_MS) },
            OR: [
              {
                status: 'FAILED',
                processedAt: { lte: new Date(now.getTime() - RETRY_BACKOFF_MS) },
              },
              { status: 'RECEIVED', receivedAt: { lte: new Date(now.getTime() - STALE_MS) } },
            ],
          },
          orderBy: { receivedAt: 'asc' },
          take: 3,
          select: { id: true },
        });
        for (const event of stuck) await this.read(event.id);
      })(),
    );
  }
}
