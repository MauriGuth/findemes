import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  type AnalysisTransaction,
  type Budget,
  computeBudgets,
  computeStats,
  type MonthKey,
  periodKeyOf,
  periodRange,
  previousMonthKey,
  type Stats,
  todayInArt,
  type UpsertBudgetInput,
} from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { toMoney } from '../common/dto.js';
import { loadPayday } from '../common/payday.js';
import { Prisma } from '../generated/prisma/client.js';
import { ReferencesService } from '../plans/references.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AlertsService } from '../push/alerts.service.js';

/** Budgets by category and the analysis screen (Phase 5, ADR 015). */
@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refs: ReferencesService,
    private readonly alerts: AlertsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async period(userId: string, requested?: MonthKey) {
    const payday = await loadPayday(this.prisma, userId);
    const today = todayInArt(this.clock.now());
    return { payday, today, month: requested ?? periodKeyOf(today, payday) };
  }

  private async spending(
    userId: string,
    month: MonthKey,
    payday: number,
  ): Promise<AnalysisTransaction[]> {
    const { start, end } = periodRange(month, payday);
    const rows = await this.prisma.transaction.findMany({
      where: { userId, direction: 'OUT', occurredAt: { gte: start, lt: end } },
      select: {
        amount: true,
        currency: true,
        direction: true,
        status: true,
        isOwnTransfer: true,
        isStatementPayment: true,
        categoryId: true,
        occurredAt: true,
      },
    });
    return rows.map((r) => ({
      ...r,
      amount: toMoney(r.amount),
      occurredAt: r.occurredAt.toISOString(),
    }));
  }

  async list(userId: string, requested?: MonthKey): Promise<{ month: MonthKey; items: Budget[] }> {
    const { payday, month } = await this.period(userId, requested);
    const [budgets, txs] = await Promise.all([
      this.prisma.budget.findMany({
        where: { userId },
        include: { category: { select: { sortOrder: true } } },
        orderBy: { category: { sortOrder: 'asc' } },
      }),
      this.spending(userId, month, payday),
    ]);
    return {
      month,
      items: computeBudgets(
        budgets.map((b) => ({ id: b.id, categoryId: b.categoryId, amount: toMoney(b.amount) })),
        txs,
      ),
    };
  }

  /** One budget per category: setting it again changes the amount. */
  async upsert(userId: string, input: UpsertBudgetInput): Promise<Budget> {
    await this.refs.assertCategory(userId, input.categoryId);
    const amount = new Prisma.Decimal(input.amount);
    const row = await this.prisma.budget.upsert({
      where: { userId_categoryId: { userId, categoryId: input.categoryId } },
      create: { userId, categoryId: input.categoryId, amount },
      // A new amount may move the thresholds: alert again if it is crossed.
      update: { amount, alertedMonth: null, alertedLevel: 0 },
    });
    this.alerts.categoryTouched(userId, row.categoryId);
    const { items } = await this.list(userId);
    const budget = items.find((b) => b.id === row.id);
    if (!budget) throw new NotFoundException();
    return budget;
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.budget.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException();
  }

  async stats(userId: string, requested?: MonthKey): Promise<Stats> {
    const { payday, today, month } = await this.period(userId, requested);
    const previousMonth = previousMonthKey(month);
    const [current, previous] = await Promise.all([
      this.spending(userId, month, payday),
      this.spending(userId, previousMonth, payday),
    ]);
    return computeStats({ month, previousMonth, payday, today, current, previous });
  }
}
