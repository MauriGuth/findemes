import { z } from 'zod';

import { IsoDateSchema, MoneyAmountSchema, MonthKeySchema, UuidSchema } from './common.js';
import { BillKind, BillStatus, CommitmentKind, PaymentMethod } from './enums.js';

export const SummaryQuerySchema = z.strictObject({ month: MonthKeySchema.optional() });

export const CommitmentSummaryItemSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  kind: CommitmentKind,
  amount: MoneyAmountSchema,
  method: PaymentMethod,
  dueOn: IsoDateSchema,
  paid: z.boolean(),
  paidAmount: MoneyAmountSchema,
  unpaidAmount: MoneyAmountSchema,
  transactionIds: z.array(UuidSchema),
  installmentNumber: z.number().int().nullable(),
  installmentsLeft: z.number().int().nullable(),
});

/** Mirrors the `MonthSummary` interface returned by `computeMonthSummary`. */
export const MonthSummarySchema = z
  .object({
    month: MonthKeySchema,
    today: IsoDateSchema,
    daysLeft: z.number().int().min(0),
    income: z.object({
      total: MoneyAmountSchema,
      source: z.enum(['confirmed', 'expected', 'carried', 'none']),
      salary: MoneyAmountSchema.nullable(),
      expected: MoneyAmountSchema.nullable(),
      other: MoneyAmountSchema,
    }),
    spent: z.object({
      cash: MoneyAmountSchema,
      credit: MoneyAmountSchema,
      today: MoneyAmountSchema,
    }),
    commitments: z.object({
      unpaidCash: MoneyAmountSchema,
      unpaidCredit: MoneyAmountSchema,
      paidCash: MoneyAmountSchema,
      paidCredit: MoneyAmountSchema,
      items: z.array(CommitmentSummaryItemSchema),
    }),
    statement: z.object({
      previous: z.object({
        amount: MoneyAmountSchema,
        paid: z.boolean(),
        paidAmount: MoneyAmountSchema,
        source: z.enum(['bill', 'estimate']),
      }),
      next: MoneyAmountSchema,
    }),
    bills: z.object({
      unpaid: MoneyAmountSchema,
      items: z.array(
        z.object({
          id: UuidSchema,
          kind: BillKind,
          issuer: z.string(),
          amount: MoneyAmountSchema,
          dueOn: IsoDateSchema,
          status: BillStatus,
          overdue: z.boolean(),
          commitmentId: UuidSchema.nullable(),
        }),
      ),
    }),
    remaining: MoneyAmountSchema,
    perDay: MoneyAmountSchema.nullable(),
    usd: z.object({ spent: MoneyAmountSchema, income: MoneyAmountSchema }),
    pending: z.object({
      needsPlan: z.boolean(),
      needsSalaryConfirmation: z.boolean(),
      salaryCandidateIds: z.array(UuidSchema),
      needsStatementPayment: z.boolean(),
      unpaidDueCommitmentIds: z.array(UuidSchema),
      reviewTransactionIds: z.array(UuidSchema),
      ownTransferPairs: z.array(z.object({ outId: UuidSchema, inId: UuidSchema })),
      possibleDuplicatePairs: z.array(z.object({ autoId: UuidSchema, manualId: UuidSchema })),
      crossChannelPairs: z.array(z.object({ keepId: UuidSchema, dropId: UuidSchema })),
      reviewBillIds: z.array(UuidSchema),
    }),
  })
  .meta({ id: 'MonthSummary' });
