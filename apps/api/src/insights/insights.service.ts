import { Inject, Injectable } from '@nestjs/common';
import {
  addDays,
  BILL_OVERDUE_DAYS,
  type CalendarDate,
  computeMonthSummary,
  formatIsoDate,
  monthKey,
  type MonthKey,
  monthRange,
  type MonthSummary,
  parseMonthKey,
  previousMonthKey,
  startOfNextMonth,
  type SummaryBillInput,
  type SummaryCommitmentInput,
  type SummaryTransactionInput,
  todayInArt,
} from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { dateToIso, dateToMonthKey, isoToDate, monthKeyToDate, toMoney } from '../common/dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

interface PlanInput {
  expectedIncome: string;
  salary: { transactionId: string; amount: string } | null;
}

@Injectable()
export class InsightsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Runs the pure formula for the previous month (statement) and then for the requested one. */
  async summary(userId: string, requested?: MonthKey): Promise<MonthSummary> {
    const today = todayInArt(this.clock.now());
    const month = requested ?? monthKey(today);
    const previous = previousMonthKey(month);

    const [commitments, planM, planPrev, txM, txPrev, bills] = await Promise.all([
      this.loadCommitments(userId),
      this.loadPlan(userId, month),
      this.loadPlan(userId, previous),
      this.loadTransactions(userId, month),
      this.loadTransactions(userId, previous),
      this.loadBills(userId, month),
    ]);

    const previousSummary = computeMonthSummary({
      month: previous,
      today,
      plan: planPrev,
      previousPlan: null,
      previousStatement: '0.00',
      commitments,
      transactions: txPrev,
    });

    const pairingTransactions = txPrev.filter(
      (t) => new Date(t.occurredAt).getTime() >= monthRange(month).start.getTime() - 86_400_000,
    );

    return computeMonthSummary({
      month,
      today,
      pairingTransactions,
      plan: planM,
      previousPlan: planPrev
        ? { expectedIncome: planPrev.expectedIncome, salaryAmount: planPrev.salary?.amount ?? null }
        : null,
      previousStatement: previousSummary.statement.next,
      commitments,
      transactions: txM,
      bills,
    });
  }

  /**
   * Bills due in the month or overdue up to BILL_OVERDUE_DAYS. A PAID bill whose payment
   * was deleted or ignored is owed again, so it goes in as UNPAID.
   */
  private async loadBills(userId: string, month: MonthKey): Promise<SummaryBillInput[]> {
    const first = parseMonthKey(month);
    const rows = await this.prisma.bill.findMany({
      where: {
        userId,
        dueOn: {
          gte: isoToDate(formatIsoDate(addDays(first, -BILL_OVERDUE_DAYS))),
          lt: isoToDate(formatIsoDate(startOfNextMonth(first))),
        },
      },
      include: { paidTransaction: { select: { status: true } } },
    });
    return rows.map((b) => ({
      id: b.id,
      kind: b.kind,
      issuer: b.issuer,
      amount: toMoney(b.amount),
      currency: b.currency,
      dueOn: dateToIso(b.dueOn),
      status:
        b.status === 'PAID' && (!b.paidTransaction || b.paidTransaction.status === 'IGNORED')
          ? 'UNPAID'
          : b.status,
      commitmentId: b.commitmentId,
      paidTransactionId: b.paidTransactionId,
    }));
  }

  private async loadCommitments(userId: string): Promise<SummaryCommitmentInput[]> {
    const rows = await this.prisma.commitment.findMany({ where: { userId } });
    return rows.map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind,
      amount: toMoney(c.amount),
      currency: c.currency,
      method: c.method,
      dayOfMonth: c.dayOfMonth,
      startsOn: dateToIso(c.startsOn),
      endsOn: c.endsOn ? dateToIso(c.endsOn) : null,
      installmentsTotal: c.installmentsTotal,
      active: c.active,
    }));
  }

  private async loadPlan(userId: string, month: MonthKey): Promise<PlanInput | null> {
    const plan = await this.prisma.monthPlan.findUnique({
      where: { userId_month: { userId, month: monthKeyToDate(month) } },
      include: { salaryTransaction: { select: { id: true, amount: true } } },
    });
    if (!plan) return null;
    return {
      expectedIncome: toMoney(plan.expectedIncome),
      salary: plan.salaryTransaction
        ? {
            transactionId: plan.salaryTransaction.id,
            amount: toMoney(plan.salaryTransaction.amount),
          }
        : null,
    };
  }

  /** Movements of the month plus the ones settling a commitment in that month. */
  private async loadTransactions(
    userId: string,
    month: MonthKey,
  ): Promise<SummaryTransactionInput[]> {
    const { start, end } = monthRange(month);
    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        OR: [
          { occurredAt: { gte: start, lt: end } },
          { commitmentId: { not: null }, commitmentMonth: monthKeyToDate(month) },
        ],
      },
      include: {
        salaryOfPlan: { select: { id: true } },
        rawEvent: { select: { channel: true } },
        paidBill: { select: { kind: true, dueOn: true } },
      },
    });
    return rows.map((t) => ({
      id: t.id,
      amount: toMoney(t.amount),
      currency: t.currency,
      direction: t.direction,
      method: t.method,
      status: t.status,
      occurredAt: t.occurredAt.toISOString(),
      isOwnTransfer: t.isOwnTransfer,
      commitmentId: t.commitmentId,
      commitmentMonth: t.commitmentMonth ? dateToMonthKey(t.commitmentMonth) : null,
      isStatementPayment: t.isStatementPayment,
      isSalary: t.salaryOfPlan !== null,
      origin: t.origin,
      sourceId: t.sourceId,
      capturedVia: t.rawEvent?.channel ?? null,
      paysStatementDueOn:
        t.paidBill?.kind === 'CARD_STATEMENT' ? dateToIso(t.paidBill.dueOn) : null,
    }));
  }
}

export type { CalendarDate };
