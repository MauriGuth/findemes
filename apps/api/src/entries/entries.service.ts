import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CreateTransactionSchema,
  type EntryDraft,
  formatIsoDate,
  todayInArt,
  type Transaction,
} from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { llmInstant, llmMoney } from '../common/llm-values.js';
import { ASSIST_CAP_MESSAGE, AssistUsageService } from '../llm/assist-usage.service.js';
import { LLM_PROVIDER, type LlmProvider } from '../llm/llm.provider.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TransactionsService } from '../transactions/transactions.service.js';

export const ENTRIES_UNAVAILABLE = 'La carga con IA todavía no está disponible.';
/** Typed entries can say "ayer" or "el lunes": never further back than this. */
const MAX_PAST_MS = 62 * 86_400_000;

export class AssistCapException extends HttpException {
  constructor() {
    super({ message: ASSIST_CAP_MESSAGE }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

/**
 * "Gasté 50 lucas en el súper y 20 en el taxi" → movements (Phase 4, ADR 014). The app
 * shows the drafts for review before saving; chats save them right away and reply with
 * what was recorded. Never logs the text.
 */
@Injectable()
export class EntriesService {
  private readonly logger = new Logger(EntriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionsService,
    private readonly usage: AssistUsageService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider | null,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  get enabled(): boolean {
    return this.llm !== null;
  }

  async parse(userId: string, text: string): Promise<EntryDraft[]> {
    if (!this.llm) throw new ServiceUnavailableException({ message: ENTRIES_UNAVAILABLE });
    if (!(await this.usage.available(userId))) throw new AssistCapException();

    const categories = await this.prisma.category.findMany({
      where: { userId: null },
      select: { id: true, slug: true },
    });
    const categoryBySlug = new Map(categories.map((c) => [c.slug, c.id]));
    const now = this.clock.now();

    let result;
    try {
      result = await this.llm.parseEntry({
        text,
        today: formatIsoDate(todayInArt(now)),
        categorySlugs: categories.map((c) => c.slug),
      });
    } catch (error) {
      await this.usage.record(userId, 'entry', 'error', {
        model: this.llm.name,
        inputTokens: 0,
        outputTokens: 0,
      });
      this.logger.error(`entry.llm_error ${error instanceof Error ? error.name : ''}`);
      throw new ServiceUnavailableException({
        message: 'No pudimos leer lo que escribiste ahora. Probá de nuevo en un rato.',
      });
    }

    const drafts = result.value.entries.slice(0, 20).flatMap((entry): EntryDraft[] => {
      const amount = llmMoney(entry.amount);
      if (!amount) return [];
      const date = llmInstant(entry.date);
      const occurredAt =
        date && date.getTime() <= now.getTime() && now.getTime() - date.getTime() <= MAX_PAST_MS
          ? date.toISOString()
          : null;
      return [
        {
          amount,
          currency: entry.currency,
          direction: entry.direction,
          method: entry.method,
          merchantRaw: entry.merchant?.trim().slice(0, 200) || null,
          categoryId: categoryBySlug.get(entry.category) ?? null,
          occurredAt,
        },
      ];
    });
    await this.usage.record(
      userId,
      'entry',
      drafts.length > 0 ? 'parsed' : 'not_financial',
      result,
    );
    this.logger.log(`entry.parsed count=${String(drafts.length)}`);
    return drafts;
  }

  /** Saves reviewed drafts as manual movements: expenses confirmed, incomes to classify. */
  async save(userId: string, drafts: EntryDraft[]): Promise<Transaction[]> {
    const saved: Transaction[] = [];
    for (const draft of drafts) {
      const input = CreateTransactionSchema.parse({
        amount: draft.amount,
        currency: draft.currency,
        direction: draft.direction,
        method: draft.method,
        ...(draft.merchantRaw ? { merchantRaw: draft.merchantRaw } : {}),
        ...(draft.categoryId ? { categoryId: draft.categoryId } : {}),
        ...(draft.occurredAt ? { occurredAt: draft.occurredAt } : {}),
      });
      saved.push(await this.transactions.create(userId, input));
    }
    return saved;
  }
}
