import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { type MonthKey, type MonthPlan, type UpsertMonthPlanInput } from '@findemes/shared';

import { monthKeyToDate } from '../common/dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toMonthPlanDto } from './plan.dto.js';

const NOT_A_SALARY =
  'Ese movimiento no puede ser tu sueldo: tiene que ser un ingreso en pesos que cuente.';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string, month: MonthKey): Promise<MonthPlan> {
    const plan = await this.prisma.monthPlan.findUnique({
      where: { userId_month: { userId, month: monthKeyToDate(month) } },
    });
    if (!plan) throw new NotFoundException();
    return toMonthPlanDto(plan);
  }

  /** Any income of the user (ARS, counting, not an own transfer) can be the salary of any month. */
  async assertSalaryEligible(userId: string, transactionId: string): Promise<void> {
    const tx = await this.prisma.transaction.findFirst({
      where: { id: transactionId, userId },
      select: { direction: true, currency: true, status: true, isOwnTransfer: true },
    });
    if (!tx) throw new NotFoundException();
    if (
      tx.direction !== 'IN' ||
      tx.currency !== 'ARS' ||
      tx.status === 'IGNORED' ||
      tx.isOwnTransfer
    ) {
      throw new BadRequestException({
        message: NOT_A_SALARY,
        issues: [{ path: 'salaryTransactionId', message: NOT_A_SALARY }],
      });
    }
  }

  async upsert(userId: string, month: MonthKey, input: UpsertMonthPlanInput): Promise<MonthPlan> {
    const monthDate = monthKeyToDate(month);
    const salaryId = input.salaryTransactionId;
    if (salaryId) await this.assertSalaryEligible(userId, salaryId);

    const plan = await this.prisma.$transaction(async (db) => {
      if (salaryId) {
        // A transaction is the salary of at most one plan: move it if another plan had it.
        await db.monthPlan.updateMany({
          where: { userId, salaryTransactionId: salaryId, NOT: { month: monthDate } },
          data: { salaryTransactionId: null },
        });
        await db.transaction.update({ where: { id: salaryId }, data: { status: 'CONFIRMED' } });
      }
      return db.monthPlan.upsert({
        where: { userId_month: { userId, month: monthDate } },
        create: {
          userId,
          month: monthDate,
          expectedIncome: input.expectedIncome,
          ...(salaryId !== undefined ? { salaryTransactionId: salaryId } : {}),
        },
        update: {
          expectedIncome: input.expectedIncome,
          ...(salaryId !== undefined ? { salaryTransactionId: salaryId } : {}),
        },
      });
    });
    return toMonthPlanDto(plan);
  }
}
