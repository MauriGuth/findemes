import { randomUUID } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  normalizeMerchant,
  pickReceiptMatch,
  type Receipt,
  RECEIPT_TIME_WINDOW_MS,
  type ReceiptUpload,
} from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { toMoney } from '../common/dto.js';
import { llmInstant, llmMoney } from '../common/llm-values.js';
import { Prisma } from '../generated/prisma/client.js';
import { RawEventCrypto } from '../ingest/raw-event-crypto.js';
import { ASSIST_CAP_MESSAGE, AssistUsageService } from '../llm/assist-usage.service.js';
import { LLM_PROVIDER, LlmRejectedError, type LlmProvider } from '../llm/llm.provider.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';

export const RECEIPTS_UNAVAILABLE = 'La lectura de tickets todavía no está disponible.';

/** Whatever Claude reads is reviewed by the user (below AUTO_CONFIRM_CONFIDENCE). */
const LLM_CONFIDENCE = 0.7;
const UPLOAD_URL_SECONDS = 600;
const VIEW_URL_SECONDS = 900;
const MAX_ITEMS = 60;
/** A ticket older than this is a scan of an old purchase: the upload time is used instead. */
const MAX_TICKET_AGE_MS = 90 * 86_400_000;

/** Why a ticket could not be read, in words the app shows as is. */
export const RECEIPT_ERRORS: Record<string, string> = {
  not_a_receipt: 'No encontramos un ticket con total en la foto. Probá con otra más nítida.',
  unreadable: 'No pudimos leer la foto. Probá con otra.',
  image_missing: 'La foto no terminó de subir. Probá de nuevo.',
  llm_cap: ASSIST_CAP_MESSAGE,
  llm_error: 'No pudimos leer el ticket ahora. Probá de nuevo en un rato.',
};

const receiptInclude = {
  items: { orderBy: { position: 'asc' } },
  transaction: { select: { id: true } },
} as const;
type ReceiptRow = Prisma.ReceiptGetPayload<{ include: typeof receiptInclude }>;

/**
 * Ticket photos (Phase 4, ADR 014): the phone uploads the compressed photo to the bucket
 * with a presigned URL, Claude reads it in the background, and the result is linked to the
 * movement of the same payment or creates a pending cash movement. Logs carry ids and
 * outcomes only: no merchants, items or amounts.
 */
@Injectable()
export class ReceiptsService {
  private readonly logger = new Logger(ReceiptsService.name);
  private readonly inflight = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly crypto: RawEventCrypto,
    private readonly usage: AssistUsageService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider | null,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  get enabled(): boolean {
    return this.storage.enabled && this.llm !== null;
  }

  private assertEnabled(): void {
    if (!this.enabled) throw new ServiceUnavailableException({ message: RECEIPTS_UNAVAILABLE });
  }

  /** Tests and shutdown: wait for background reading. */
  async drain(): Promise<void> {
    while (this.inflight.size > 0) await Promise.allSettled([...this.inflight]);
  }

  private track(work: Promise<void>): void {
    const tracked = work
      .catch(() => this.logger.error('receipt.background_error'))
      .finally(() => this.inflight.delete(tracked));
    this.inflight.add(tracked);
  }

  uploadUrl(userId: string): ReceiptUpload {
    this.assertEnabled();
    const key = `receipts/${userId}/${randomUUID()}.jpg`;
    return {
      key,
      url: this.storage.presign('PUT', key, UPLOAD_URL_SECONDS),
      expiresAt: new Date(this.clock.now().getTime() + UPLOAD_URL_SECONDS * 1000).toISOString(),
    };
  }

  /** After the phone uploaded the photo: register it and read it in the background. */
  async create(userId: string, key: string): Promise<Receipt> {
    this.assertEnabled();
    if (!key.startsWith(`receipts/${userId}/`)) throw new BadRequestException('Foto inválida');
    const existing = await this.prisma.receipt.findFirst({
      where: { userId, imageKey: key },
      include: receiptInclude,
    });
    if (existing) return this.toDto(existing);
    const row = await this.prisma.receipt.create({
      data: { userId, imageKey: key, status: 'UPLOADED' },
      include: receiptInclude,
    });
    this.logger.log(`receipt.uploaded receipt=${row.id}`);
    this.track(this.process(row.id));
    return this.toDto(row);
  }

  /** From a chat: the API stores the photo itself and waits for the reading. */
  async createFromImage(userId: string, bytes: Uint8Array, contentType: string): Promise<Receipt> {
    this.assertEnabled();
    const key = `receipts/${userId}/${randomUUID()}.jpg`;
    await this.storage.put(key, bytes, contentType);
    const row = await this.prisma.receipt.create({
      data: { userId, imageKey: key, status: 'UPLOADED' },
    });
    await this.process(row.id);
    return this.get(userId, row.id);
  }

  async list(userId: string): Promise<Receipt[]> {
    const rows = await this.prisma.receipt.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: receiptInclude,
    });
    return rows.map((row) => this.toDto(row, false));
  }

  async get(userId: string, id: string): Promise<Receipt> {
    const row = await this.prisma.receipt.findFirst({
      where: { id, userId },
      include: receiptInclude,
    });
    if (!row) throw new NotFoundException();
    return this.toDto(row);
  }

  async retry(userId: string, id: string): Promise<Receipt> {
    this.assertEnabled();
    const row = await this.prisma.receipt.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException();
    if (row.status !== 'FAILED') throw new ConflictException('Este ticket ya se leyó.');
    await this.prisma.receipt.update({
      where: { id },
      data: { status: 'UPLOADED', error: null },
    });
    this.track(this.process(id));
    return this.get(userId, id);
  }

  /** Deletes the photo, the reading, and the movement it created if still unconfirmed. */
  async remove(userId: string, id: string): Promise<void> {
    const row = await this.prisma.receipt.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException();
    await this.prisma.$transaction([
      this.prisma.transaction.deleteMany({
        where: { userId, receiptId: id, fingerprint: `receipt:${id}`, status: 'PENDING' },
      }),
      this.prisma.receipt.delete({ where: { id } }),
    ]);
    await this.storage.delete(row.imageKey);
    this.logger.log(`receipt.deleted receipt=${id}`);
  }

  async process(id: string): Promise<void> {
    const receipt = await this.prisma.receipt.findUnique({ where: { id } });
    if (!receipt || receipt.status !== 'UPLOADED') return;
    const fail = async (error: keyof typeof RECEIPT_ERRORS) => {
      await this.prisma.receipt.update({ where: { id }, data: { status: 'FAILED', error } });
      this.logger.log(`receipt.failed receipt=${id} reason=${error}`);
    };

    try {
      if (!this.llm) return await fail('llm_error');
      if (!(await this.usage.available(receipt.userId))) return await fail('llm_cap');
      const image = await this.storage.get(receipt.imageKey);
      if (!image) return await fail('image_missing');

      const categories = await this.prisma.category.findMany({
        where: { userId: null },
        select: { id: true, slug: true },
      });
      const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]));

      let result;
      try {
        result = await this.llm.extractReceipt({
          imageBase64: image.bytes.toString('base64'),
          mediaType: image.contentType.includes('png')
            ? 'image/png'
            : image.contentType.includes('webp')
              ? 'image/webp'
              : 'image/jpeg',
          categorySlugs: categories.map((c) => c.slug),
        });
      } catch (error) {
        await this.usage.record(receipt.userId, 'receipt', 'error', {
          model: this.llm.name,
          inputTokens: 0,
          outputTokens: 0,
        });
        return await fail(error instanceof LlmRejectedError ? 'unreadable' : 'llm_error');
      }

      const value = result.value;
      const total = llmMoney(value.total);
      await this.usage.record(
        receipt.userId,
        'receipt',
        value.isReceipt && total ? 'parsed' : 'not_financial',
        result,
      );
      if (!value.isReceipt || !total) return await fail('not_a_receipt');

      const now = this.clock.now();
      const printed = llmInstant(value.issuedAt);
      const issuedAt =
        printed &&
        printed.getTime() <= now.getTime() + 86_400_000 &&
        now.getTime() - printed.getTime() <= MAX_TICKET_AGE_MS
          ? printed
          : null;
      const merchant = value.merchant?.trim().slice(0, 200) || null;
      const cuit = value.cuit?.replace(/\D/g, '') ?? '';
      const items = value.items.slice(0, MAX_ITEMS).flatMap((item, position) => {
        const lineTotal = llmMoney(item.total);
        if (!lineTotal || !item.name.trim()) return [];
        const qty = /^\d{1,8}(\.\d{1,3})?$/.test(item.qty.trim()) ? item.qty.trim() : '1';
        return [
          {
            position,
            name: item.name.trim().slice(0, 200),
            qty: new Prisma.Decimal(qty),
            unitPrice: llmMoney(item.unitPrice),
            total: new Prisma.Decimal(lineTotal),
            categoryId: categoryBySlug.get(item.category) ?? null,
          },
        ];
      });
      const encrypted = this.crypto.enabled
        ? this.crypto.encrypt(receipt.userId, { model: result.model, extraction: value })
        : null;

      await this.prisma.$transaction([
        this.prisma.receiptItem.deleteMany({ where: { receiptId: id } }),
        this.prisma.receipt.update({
          where: { id },
          data: {
            merchant,
            cuit: cuit.length === 11 ? cuit : null,
            issuedAt,
            total: new Prisma.Decimal(total),
            currency: value.currency,
            paymentMethodHint: value.paymentMethodHint,
            status: 'EXTRACTED',
            error: null,
            ...(encrypted
              ? {
                  extractionEnc: encrypted.payloadEnc,
                  extractionIv: encrypted.payloadIv,
                  keyVersion: encrypted.keyVersion,
                }
              : {}),
            items: {
              create: items.map((item) => ({
                ...item,
                unitPrice: item.unitPrice ? new Prisma.Decimal(item.unitPrice) : null,
              })),
            },
          },
        }),
      ]);
      await this.link(receipt.userId, id, {
        total,
        currency: value.currency,
        at: issuedAt ?? receipt.createdAt,
        merchant,
        method: value.paymentMethodHint,
        categoryId: this.mainCategory(items),
      });
    } catch (error) {
      await fail('llm_error');
      this.logger.error(`receipt.error receipt=${id} ${error instanceof Error ? error.name : ''}`);
    }
  }

  /** The category with the largest share of the ticket. */
  private mainCategory(
    items: { total: Prisma.Decimal; categoryId: string | null }[],
  ): string | null {
    const totals = new Map<string, Prisma.Decimal>();
    for (const item of items) {
      if (!item.categoryId) continue;
      totals.set(
        item.categoryId,
        (totals.get(item.categoryId) ?? new Prisma.Decimal(0)).add(item.total),
      );
    }
    let best: [string, Prisma.Decimal] | null = null;
    for (const entry of totals) if (!best || entry[1].gt(best[1])) best = entry;
    return best?.[0] ?? null;
  }

  /**
   * Same payment already seen (notification, email, manual): link and enrich it. Otherwise a
   * pending movement for the user to confirm; a notification arriving later merges into it
   * (IngestProcessor.createMovement).
   */
  private async link(
    userId: string,
    receiptId: string,
    ticket: {
      total: string;
      currency: 'ARS' | 'USD';
      at: Date;
      merchant: string | null;
      method: Prisma.TransactionCreateInput['method'] | null;
      categoryId: string | null;
    },
  ): Promise<void> {
    const candidates = await this.prisma.transaction.findMany({
      where: {
        userId,
        direction: 'OUT',
        status: { not: 'IGNORED' },
        isOwnTransfer: false,
        receiptId: null,
        currency: ticket.currency,
        occurredAt: {
          gte: new Date(ticket.at.getTime() - RECEIPT_TIME_WINDOW_MS),
          lte: new Date(ticket.at.getTime() + RECEIPT_TIME_WINDOW_MS),
        },
      },
      select: {
        id: true,
        amount: true,
        currency: true,
        occurredAt: true,
        categoryId: true,
        merchantRaw: true,
      },
    });
    const match = pickReceiptMatch(
      { total: ticket.total, currency: ticket.currency, at: ticket.at.toISOString() },
      candidates.map((c) => ({
        ...c,
        amount: toMoney(c.amount),
        occurredAt: c.occurredAt.toISOString(),
      })),
    );

    if (match) {
      await this.prisma.$transaction([
        this.prisma.transaction.update({
          where: { id: match.id },
          data: {
            receiptId,
            ...(match.categoryId === null && ticket.categoryId
              ? { categoryId: ticket.categoryId }
              : {}),
            ...(match.merchantRaw === null && ticket.merchant
              ? { merchantRaw: ticket.merchant, merchantNorm: normalizeMerchant(ticket.merchant) }
              : {}),
          },
        }),
        this.prisma.receipt.update({ where: { id: receiptId }, data: { status: 'MATCHED' } }),
      ]);
      this.logger.log(`receipt.matched receipt=${receiptId}`);
      return;
    }

    await this.prisma.$transaction([
      this.prisma.transaction.create({
        data: {
          userId,
          amount: new Prisma.Decimal(ticket.total),
          currency: ticket.currency,
          direction: 'OUT',
          method: ticket.method ?? 'CASH',
          merchantRaw: ticket.merchant,
          merchantNorm: normalizeMerchant(ticket.merchant),
          categoryId: ticket.categoryId,
          occurredAt: ticket.at,
          status: 'PENDING',
          confidence: new Prisma.Decimal(LLM_CONFIDENCE.toFixed(2)),
          origin: 'LLM',
          fingerprint: `receipt:${receiptId}`,
          receiptId,
        },
      }),
      this.prisma.receipt.update({ where: { id: receiptId }, data: { status: 'UNMATCHED' } }),
    ]);
    this.logger.log(`receipt.unmatched receipt=${receiptId}`);
  }

  private toDto(row: ReceiptRow, withImage = true): Receipt {
    return {
      id: row.id,
      status: row.status,
      merchant: row.merchant,
      cuit: row.cuit,
      issuedAt: row.issuedAt?.toISOString() ?? null,
      total: row.total ? toMoney(row.total) : null,
      currency: row.currency,
      paymentMethodHint: row.paymentMethodHint,
      items: row.items.map((item) => ({
        name: item.name,
        qty: item.qty.toString(),
        unitPrice: item.unitPrice ? toMoney(item.unitPrice) : null,
        total: toMoney(item.total),
        categoryId: item.categoryId,
      })),
      transactionId: row.transaction?.id ?? null,
      imageUrl:
        withImage && this.storage.enabled
          ? this.storage.presign('GET', row.imageKey, VIEW_URL_SECONDS)
          : null,
      error: row.error ? (RECEIPT_ERRORS[row.error] ?? RECEIPT_ERRORS.llm_error ?? null) : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
