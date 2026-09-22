import { type Transaction } from '@findemes/shared';

import { dateToMonthKey, toMoney } from '../common/dto.js';
import { type Prisma } from '../generated/prisma/client.js';

export const transactionInclude = { salaryOfPlan: { select: { id: true } } } as const;

export type TransactionRow = Prisma.TransactionGetPayload<{ include: typeof transactionInclude }>;

export function toTransactionDto(row: TransactionRow): Transaction {
  return {
    id: row.id,
    userId: row.userId,
    sourceId: row.sourceId,
    amount: toMoney(row.amount),
    currency: row.currency,
    direction: row.direction,
    method: row.method,
    merchantRaw: row.merchantRaw,
    merchantNorm: row.merchantNorm,
    categoryId: row.categoryId,
    occurredAt: row.occurredAt.toISOString(),
    capturedAt: row.capturedAt.toISOString(),
    status: row.status,
    confidence: Number(row.confidence.toFixed(2)),
    origin: row.origin,
    fingerprint: row.fingerprint,
    rawEventId: row.rawEventId,
    receiptId: row.receiptId,
    note: row.note,
    isOwnTransfer: row.isOwnTransfer,
    commitmentId: row.commitmentId,
    commitmentMonth: row.commitmentMonth ? dateToMonthKey(row.commitmentMonth) : null,
    isStatementPayment: row.isStatementPayment,
    isSalary: row.salaryOfPlan !== null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
