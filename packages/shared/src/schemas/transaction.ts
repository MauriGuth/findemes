import { z } from 'zod';

import { IsoDateTimeSchema, MoneyAmountSchema, UuidSchema } from './common.js';
import {
  Currency,
  PaymentMethod,
  TransactionDirection,
  TransactionOrigin,
  TransactionStatus,
} from './enums.js';

/**
 * A transaction as the API returns it. Mirrors the Prisma `Transaction` model:
 * Decimal columns become strings, DateTime columns become ISO strings.
 */
export const TransactionSchema = z.object({
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
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type Transaction = z.infer<typeof TransactionSchema>;

/** What the app sends when the user loads a transaction by hand (phase 1). */
export const CreateTransactionSchema = z
  .object({
    amount: MoneyAmountSchema.refine((value) => !value.startsWith('-'), {
      error: 'El monto tiene que ser positivo; la dirección dice si entra o sale',
    }),
    currency: Currency.default('ARS'),
    direction: TransactionDirection.default('OUT'),
    method: PaymentMethod,
    merchantRaw: z.string().trim().min(1, 'Contanos dónde fue').max(500).optional(),
    categoryId: UuidSchema.optional(),
    sourceId: UuidSchema.optional(),
    occurredAt: IsoDateTimeSchema.optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export type CreateTransactionInput = z.input<typeof CreateTransactionSchema>;
export type CreateTransaction = z.output<typeof CreateTransactionSchema>;
