import { z } from 'zod';

import {
  IsoDateTimeSchema,
  MoneyAmountSchema,
  MonthKeySchema,
  PositiveMoneySchema,
  UuidSchema,
} from './common.js';
import {
  Currency,
  PaymentMethod,
  TransactionDirection,
  TransactionOrigin,
  TransactionStatus,
} from './enums.js';

const CASH_METHODS: readonly string[] = ['DEBIT', 'TRANSFER', 'CASH', 'WALLET'];

/**
 * A transaction as the API returns it. Mirrors the Prisma `Transaction` model:
 * Decimal columns become strings, DateTime columns become ISO strings.
 */
export const TransactionSchema = z
  .object({
    id: UuidSchema,
    userId: UuidSchema,
    sourceId: UuidSchema.nullable(),
    amount: MoneyAmountSchema,
    currency: Currency,
    direction: TransactionDirection,
    method: PaymentMethod,
    merchantRaw: z.string().max(500).nullable(),
    merchantNorm: z.string().max(200).nullable(),
    categoryId: UuidSchema.nullable(),
    occurredAt: IsoDateTimeSchema,
    capturedAt: IsoDateTimeSchema,
    status: TransactionStatus,
    confidence: z.number().min(0).max(1),
    origin: TransactionOrigin,
    fingerprint: z.string().min(1).max(128),
    rawEventId: UuidSchema.nullable(),
    receiptId: UuidSchema.nullable(),
    note: z.string().max(500).nullable(),
    isOwnTransfer: z.boolean(),
    commitmentId: UuidSchema.nullable(),
    commitmentMonth: MonthKeySchema.nullable(),
    isStatementPayment: z.boolean(),
    /** Linked as the salary of a MonthPlan (derived). */
    isSalary: z.boolean(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .meta({ id: 'Transaction' });
export type Transaction = z.infer<typeof TransactionSchema>;

export const TransactionListSchema = z
  .object({ items: z.array(TransactionSchema) })
  .meta({ id: 'TransactionList' });

/** What the app sends when the user loads a movement by hand. */
export const CreateTransactionSchema = z
  .strictObject({
    amount: PositiveMoneySchema,
    currency: Currency.default('ARS'),
    direction: TransactionDirection.default('OUT'),
    method: PaymentMethod,
    merchantRaw: z.string().trim().min(1, 'Contanos dónde fue').max(500).optional(),
    categoryId: UuidSchema.optional(),
    sourceId: UuidSchema.optional(),
    occurredAt: IsoDateTimeSchema.optional(),
    note: z.string().trim().max(500).optional(),
    /** Only meaningful for incomes; expenses are always CONFIRMED. */
    status: TransactionStatus.optional(),
    isOwnTransfer: z.boolean().default(false),
    commitmentId: UuidSchema.optional(),
    /** Month the payment settles; defaults to the month of occurredAt (Argentina). */
    commitmentMonth: MonthKeySchema.optional(),
    isStatementPayment: z.boolean().default(false),
    markAsSalary: z.boolean().default(false),
    /** Month whose plan this salary belongs to; defaults to the month of occurredAt. */
    salaryMonth: MonthKeySchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.markAsSalary && value.direction !== 'IN') {
      ctx.addIssue({
        code: 'custom',
        path: ['markAsSalary'],
        message: 'Solo un ingreso puede ser tu sueldo',
      });
    }
    if (value.markAsSalary && value.currency !== 'ARS') {
      ctx.addIssue({
        code: 'custom',
        path: ['markAsSalary'],
        message: 'Por ahora el sueldo tiene que ser en pesos',
      });
    }
    if (value.commitmentId !== undefined && value.direction !== 'OUT') {
      ctx.addIssue({
        code: 'custom',
        path: ['commitmentId'],
        message: 'Solo un gasto puede pagar un compromiso',
      });
    }
    if (
      value.isStatementPayment &&
      (value.direction !== 'OUT' || !CASH_METHODS.includes(value.method))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['isStatementPayment'],
        message: 'El resumen se paga con plata que sale hoy',
      });
    }
    if (
      value.isOwnTransfer &&
      (value.markAsSalary || value.commitmentId !== undefined || value.isStatementPayment)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['isOwnTransfer'],
        message: 'Una transferencia entre tus cuentas no es un sueldo ni un pago',
      });
    }
  });
export type CreateTransactionInput = z.input<typeof CreateTransactionSchema>;
export type CreateTransaction = z.output<typeof CreateTransactionSchema>;

export const UpdateTransactionSchema = z
  .strictObject({
    amount: PositiveMoneySchema.optional(),
    currency: Currency.optional(),
    direction: TransactionDirection.optional(),
    method: PaymentMethod.optional(),
    merchantRaw: z.string().trim().min(1, 'Contanos dónde fue').max(500).nullable().optional(),
    categoryId: UuidSchema.nullable().optional(),
    sourceId: UuidSchema.nullable().optional(),
    occurredAt: IsoDateTimeSchema.optional(),
    note: z.string().trim().max(500).nullable().optional(),
    status: TransactionStatus.optional(),
    isOwnTransfer: z.boolean().optional(),
    commitmentId: UuidSchema.nullable().optional(),
    commitmentMonth: MonthKeySchema.nullable().optional(),
    isStatementPayment: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { error: 'No hay nada para cambiar' });
export type UpdateTransactionInput = z.input<typeof UpdateTransactionSchema>;

export const ListTransactionsQuerySchema = z.strictObject({
  month: MonthKeySchema.optional(),
  status: TransactionStatus.optional(),
});
export type ListTransactionsQuery = z.output<typeof ListTransactionsQuerySchema>;

/** "Gasté $600.000 con tarjeta en 6 cuotas": creates the installment commitment, never the purchase. */
export const CreateInstallmentPurchaseSchema = z.strictObject({
  total: PositiveMoneySchema,
  installments: z.number().int().min(2, 'Son al menos 2 cuotas').max(60, 'Son demasiadas cuotas'),
  name: z.string().trim().min(1, 'Contanos qué compraste').max(80),
  occurredAt: IsoDateTimeSchema.optional(),
  sourceId: UuidSchema.optional(),
  categoryId: UuidSchema.optional(),
});
export type CreateInstallmentPurchaseInput = z.input<typeof CreateInstallmentPurchaseSchema>;
