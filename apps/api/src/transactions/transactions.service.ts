import { randomUUID } from 'node:crypto';

import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  compareMoney,
  type CreateTransaction,
  type ListTransactionsQuery,
  monthKey,
  type MonthKey,
  monthRange,
  type PayCommitmentInput,
  sumMoney,
  toArtCalendarDate,
  todayInArt,
  type Transaction,
  type UpdateTransactionInput,
} from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { monthKeyToDate, toMoney } from '../common/dto.js';
import { CommitmentsService } from '../plans/commitments.service.js';
import { PlansService } from '../plans/plans.service.js';
import { ReferencesService } from '../plans/references.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toTransactionDto, transactionInclude } from './transaction.dto.js';

const MAX_LIST = 500;

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refs: ReferencesService,
    private readonly plans: PlansService,
    private readonly commitments: CommitmentsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private currentMonth(): MonthKey {
    return monthKey(todayInArt(this.clock.now()));
  }

  async list(userId: string, query: ListTransactionsQuery): Promise<Transaction[]> {
    const month = query.month ?? this.currentMonth();
    const { start, end } = monthRange(month);
    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        occurredAt: { gte: start, lt: end },
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: MAX_LIST,
      include: transactionInclude,
    });
    return rows.map(toTransactionDto);
  }

  async get(userId: string, id: string): Promise<Transaction> {
    const row = await this.prisma.transaction.findFirst({
      where: { id, userId },
      include: transactionInclude,
    });
    if (!row) throw new NotFoundException();
    return toTransactionDto(row);
  }

  async create(userId: string, input: CreateTransaction): Promise<Transaction> {
    await Promise.all([
      this.refs.assertCategory(userId, input.categoryId),
      this.refs.assertSource(input.sourceId),
      this.refs.assertCommitment(userId, input.commitmentId),
    ]);
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : this.clock.now();
    const occurredMonth = monthKey(toArtCalendarDate(occurredAt));

    // Expenses count right away; an income counts only once the user said what it is (D7).
    const classified = input.markAsSalary || input.isOwnTransfer || input.status !== undefined;
    const status =
      input.direction === 'OUT'
        ? (input.status ?? 'CONFIRMED')
        : classified
          ? (input.status ?? 'CONFIRMED')
          : 'PENDING';

    const row = await this.prisma.$transaction(async (db) => {
      const created = await db.transaction.create({
        data: {
          userId,
          amount: input.amount,
          currency: input.currency,
          direction: input.direction,
          method: input.method,
          merchantRaw: input.merchantRaw ?? null,
          categoryId: input.categoryId ?? null,
          sourceId: input.sourceId ?? null,
          occurredAt,
          status,
          confidence: 1,
          origin: 'MANUAL',
          fingerprint: `manual:${randomUUID()}`,
          note: input.note ?? null,
          isOwnTransfer: input.isOwnTransfer,
          commitmentId: input.commitmentId ?? null,
          commitmentMonth: input.commitmentId
            ? monthKeyToDate(input.commitmentMonth ?? occurredMonth)
            : null,
          isStatementPayment: input.isStatementPayment,
        },
        include: transactionInclude,
      });
      if (input.markAsSalary) {
        const salaryMonth = monthKeyToDate(input.salaryMonth ?? occurredMonth);
        await db.monthPlan.updateMany({
          where: { userId, salaryTransactionId: created.id, NOT: { month: salaryMonth } },
          data: { salaryTransactionId: null },
        });
        await db.monthPlan.upsert({
          where: { userId_month: { userId, month: salaryMonth } },
          create: {
            userId,
            month: salaryMonth,
            expectedIncome: created.amount,
            salaryTransactionId: created.id,
          },
          update: { salaryTransactionId: created.id },
        });
        return db.transaction.findUniqueOrThrow({
          where: { id: created.id },
          include: transactionInclude,
        });
      }
      return created;
    });
    return toTransactionDto(row);
  }

  async update(userId: string, id: string, input: UpdateTransactionInput): Promise<Transaction> {
    const current = await this.prisma.transaction.findFirst({
      where: { id, userId },
      include: transactionInclude,
    });
    if (!current) throw new NotFoundException();
    await Promise.all([
      this.refs.assertCategory(userId, input.categoryId),
      this.refs.assertSource(input.sourceId),
      this.refs.assertCommitment(userId, input.commitmentId),
    ]);

    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : current.occurredAt;
    const commitmentId =
      input.commitmentId !== undefined ? input.commitmentId : current.commitmentId;
    let commitmentMonth: Date | null = null;
    if (commitmentId) {
      const requested = input.commitmentMonth !== undefined ? input.commitmentMonth : null;
      commitmentMonth = requested
        ? monthKeyToDate(requested)
        : (current.commitmentMonth ?? monthKeyToDate(monthKey(toArtCalendarDate(occurredAt))));
    }

    const row = await this.prisma.$transaction(async (db) => {
      const updated = await db.transaction.update({
        where: { id },
        data: {
          ...(input.amount !== undefined ? { amount: input.amount } : {}),
          ...(input.currency !== undefined ? { currency: input.currency } : {}),
          ...(input.direction !== undefined ? { direction: input.direction } : {}),
          ...(input.method !== undefined ? { method: input.method } : {}),
          ...(input.merchantRaw !== undefined ? { merchantRaw: input.merchantRaw } : {}),
          ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
          ...(input.sourceId !== undefined ? { sourceId: input.sourceId } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.isOwnTransfer !== undefined ? { isOwnTransfer: input.isOwnTransfer } : {}),
          ...(input.isStatementPayment !== undefined
            ? { isStatementPayment: input.isStatementPayment }
            : {}),
          occurredAt,
          commitmentId,
          commitmentMonth,
        },
        include: transactionInclude,
      });
      // A salary that stopped being an eligible income is no longer the plan's salary.
      const stillSalaryEligible =
        updated.direction === 'IN' &&
        updated.currency === 'ARS' &&
        updated.status !== 'IGNORED' &&
        !updated.isOwnTransfer;
      if (updated.salaryOfPlan && !stillSalaryEligible) {
        await db.monthPlan.update({
          where: { id: updated.salaryOfPlan.id },
          data: { salaryTransactionId: null },
        });
        return db.transaction.findUniqueOrThrow({ where: { id }, include: transactionInclude });
      }
      return updated;
    });
    return toTransactionDto(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    const found = await this.prisma.transaction.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException();
    await this.prisma.transaction.delete({ where: { id } });
  }

  /** "Pagué": a cash movement linked to the commitment for the given month, with the commitment's defaults. */
  async payCommitment(
    userId: string,
    commitmentId: string,
    input: PayCommitmentInput,
  ): Promise<Transaction> {
    const commitment = await this.commitments.getOwned(userId, commitmentId);
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : this.clock.now();
    const month = input.commitmentMonth ?? monthKey(toArtCalendarDate(occurredAt));

    const paid = await this.prisma.transaction.findMany({
      where: {
        userId,
        commitmentId,
        commitmentMonth: monthKeyToDate(month),
        status: { not: 'IGNORED' },
        isOwnTransfer: false,
      },
      select: { amount: true },
    });
    const paidAmount = sumMoney(paid.map((p) => toMoney(p.amount)));
    if (compareMoney(paidAmount, toMoney(commitment.amount)) >= 0) {
      throw new ConflictException({ message: 'Ese compromiso ya figura pagado ese mes.' });
    }

    return this.create(userId, {
      amount: input.amount ?? toMoney(commitment.amount),
      currency: 'ARS',
      direction: 'OUT',
      method: input.method ?? commitment.method,
      merchantRaw: commitment.name,
      ...(commitment.categoryId ? { categoryId: commitment.categoryId } : {}),
      ...((input.sourceId ?? commitment.sourceId)
        ? { sourceId: input.sourceId ?? commitment.sourceId ?? undefined }
        : {}),
      occurredAt: occurredAt.toISOString(),
      ...(input.note !== undefined ? { note: input.note } : {}),
      status: 'CONFIRMED',
      isOwnTransfer: false,
      commitmentId,
      commitmentMonth: month,
      isStatementPayment: false,
      markAsSalary: false,
    });
  }

  /** Salary linking through PUT /plans/:month reuses the same eligibility rule. */
  assertSalaryEligible(userId: string, transactionId: string): Promise<void> {
    return this.plans.assertSalaryEligible(userId, transactionId);
  }
}
