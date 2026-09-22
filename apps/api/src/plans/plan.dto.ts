import { type Commitment, type MonthPlan } from '@findemes/shared';

import { dateToMonthKey, toMoney } from '../common/dto.js';
import {
  type Commitment as CommitmentRow,
  type MonthPlan as MonthPlanRow,
} from '../generated/prisma/client.js';

export function toMonthPlanDto(row: MonthPlanRow): MonthPlan {
  return {
    id: row.id,
    month: dateToMonthKey(row.month),
    expectedIncome: toMoney(row.expectedIncome),
    currency: row.currency,
    salaryTransactionId: row.salaryTransactionId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCommitmentDto(row: CommitmentRow): Commitment {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    amount: toMoney(row.amount),
    currency: row.currency,
    method: row.method,
    dayOfMonth: row.dayOfMonth,
    startsOn: dateToMonthKey(row.startsOn),
    endsOn: row.endsOn ? dateToMonthKey(row.endsOn) : null,
    installmentsTotal: row.installmentsTotal,
    sourceId: row.sourceId,
    categoryId: row.categoryId,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
