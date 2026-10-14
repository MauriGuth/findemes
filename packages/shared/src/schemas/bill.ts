import { z } from 'zod';

import {
  IsoDateSchema,
  IsoDateTimeSchema,
  MoneyAmountSchema,
  MonthKeySchema,
  PositiveMoneySchema,
  UuidSchema,
} from './common.js';
import { BillKind, BillOrigin, BillStatus, Currency, PaymentMethod } from './enums.js';

/** Something the user has to pay by a date: a card statement or a bill (ADR 013). */
export const BillSchema = z
  .object({
    id: UuidSchema,
    kind: BillKind,
    issuer: z.string(),
    amount: MoneyAmountSchema,
    minimumAmount: MoneyAmountSchema.nullable(),
    currency: Currency,
    dueOn: IsoDateSchema,
    periodMonth: MonthKeySchema.nullable(),
    status: BillStatus,
    origin: BillOrigin,
    commitmentId: UuidSchema.nullable(),
    paidTransactionId: UuidSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .meta({ id: 'Bill' });
export type Bill = z.infer<typeof BillSchema>;

export const BillListSchema = z.object({ items: z.array(BillSchema) }).meta({ id: 'BillList' });

export const BillListQuerySchema = z.strictObject({ month: MonthKeySchema.optional() });

const issuer = z.string().trim().min(1, { error: 'Poné quién te lo cobra' }).max(120);

export const CreateBillSchema = z.strictObject({
  kind: BillKind,
  issuer,
  amount: PositiveMoneySchema,
  minimumAmount: PositiveMoneySchema.nullable().optional(),
  currency: Currency.default('ARS'),
  dueOn: IsoDateSchema,
  commitmentId: UuidSchema.nullable().optional(),
});
export type CreateBillInput = z.input<typeof CreateBillSchema>;

/** PAID is reached only through POST /bills/:id/payments, so a payment always exists. */
export const UpdateBillSchema = z.strictObject({
  kind: BillKind.optional(),
  issuer: issuer.optional(),
  amount: PositiveMoneySchema.optional(),
  minimumAmount: PositiveMoneySchema.nullable().optional(),
  dueOn: IsoDateSchema.optional(),
  status: z.enum(['UNPAID', 'IGNORED']).optional(),
  commitmentId: UuidSchema.nullable().optional(),
});
export type UpdateBillInput = z.input<typeof UpdateBillSchema>;

/** Either link a movement that already paid it, or record a new payment. */
export const PayBillSchema = z.strictObject({
  transactionId: UuidSchema.optional(),
  amount: PositiveMoneySchema.optional(),
  method: PaymentMethod.optional(),
  occurredAt: IsoDateTimeSchema.optional(),
});
export type PayBillInput = z.input<typeof PayBillSchema>;

/** The user's forwarding address and what Gmail sent to confirm it. */
export const InboundAddressSchema = z
  .object({
    /** null while the server has no inbound provider configured. */
    address: z.string().nullable(),
    gmailConfirmation: z
      .object({
        code: z.string().nullable(),
        link: z.string().nullable(),
        receivedAt: IsoDateTimeSchema,
      })
      .nullable(),
    lastEmailAt: IsoDateTimeSchema.nullable(),
  })
  .meta({ id: 'InboundAddress' });
export type InboundAddress = z.infer<typeof InboundAddressSchema>;
