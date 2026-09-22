import { z } from 'zod';

import {
  IsoDateTimeSchema,
  MoneyAmountSchema,
  MonthKeySchema,
  NonNegativeMoneySchema,
  PositiveMoneySchema,
  UuidSchema,
} from './common.js';
import { CommitmentKind, Currency, PaymentMethod } from './enums.js';

export const MonthPlanSchema = z
  .object({
    id: UuidSchema,
    month: MonthKeySchema,
    expectedIncome: MoneyAmountSchema,
    currency: Currency,
    salaryTransactionId: UuidSchema.nullable(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .meta({ id: 'MonthPlan' });
export type MonthPlan = z.infer<typeof MonthPlanSchema>;

export const UpsertMonthPlanSchema = z.strictObject({
  expectedIncome: NonNegativeMoneySchema.refine((v) => !v.startsWith('-'), {
    error: 'El ingreso esperado no puede ser negativo',
  }),
  salaryTransactionId: UuidSchema.nullable().optional(),
});
export type UpsertMonthPlanInput = z.input<typeof UpsertMonthPlanSchema>;

export const CommitmentSchema = z
  .object({
    id: UuidSchema,
    kind: CommitmentKind,
    name: z.string(),
    amount: MoneyAmountSchema,
    currency: Currency,
    method: PaymentMethod,
    dayOfMonth: z.number().int().min(1).max(31),
    startsOn: MonthKeySchema,
    endsOn: MonthKeySchema.nullable(),
    installmentsTotal: z.number().int().nullable(),
    sourceId: UuidSchema.nullable(),
    categoryId: UuidSchema.nullable(),
    active: z.boolean(),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .meta({ id: 'Commitment' });
export type Commitment = z.infer<typeof CommitmentSchema>;

export const CommitmentListSchema = z
  .object({ items: z.array(CommitmentSchema) })
  .meta({ id: 'CommitmentList' });

const commitmentFields = {
  kind: CommitmentKind,
  name: z.string().trim().min(1, 'Ponele un nombre').max(80, 'El nombre es demasiado largo'),
  amount: PositiveMoneySchema,
  currency: z.literal('ARS', { error: 'Por ahora los compromisos son en pesos' }).default('ARS'),
  method: PaymentMethod.default('DEBIT'),
  dayOfMonth: z
    .number()
    .int()
    .min(1, 'El día tiene que estar entre 1 y 31')
    .max(31, 'El día tiene que estar entre 1 y 31'),
  /** Defaults to the current month (Argentina). */
  startsOn: MonthKeySchema.optional(),
  endsOn: MonthKeySchema.optional(),
  installmentsTotal: z
    .number()
    .int()
    .min(1, '¿Cuántas cuotas son?')
    .max(120, 'Son demasiadas cuotas')
    .optional(),
  sourceId: UuidSchema.optional(),
  categoryId: UuidSchema.optional(),
};

function checkCommitment(
  value: { kind?: string; installmentsTotal?: number; startsOn?: string; endsOn?: string },
  ctx: z.RefinementCtx,
): void {
  if (value.kind === 'INSTALLMENT' && value.installmentsTotal === undefined) {
    ctx.addIssue({ code: 'custom', path: ['installmentsTotal'], message: '¿Cuántas cuotas son?' });
  }
  if (value.startsOn !== undefined && value.endsOn !== undefined && value.endsOn < value.startsOn) {
    ctx.addIssue({
      code: 'custom',
      path: ['endsOn'],
      message: 'Tiene que terminar después de empezar',
    });
  }
}

export const CreateCommitmentSchema = z.strictObject(commitmentFields).superRefine(checkCommitment);
export type CreateCommitmentInput = z.input<typeof CreateCommitmentSchema>;
export type CreateCommitment = z.output<typeof CreateCommitmentSchema>;

export const UpdateCommitmentSchema = z
  .strictObject({
    kind: commitmentFields.kind.optional(),
    name: commitmentFields.name.optional(),
    amount: commitmentFields.amount.optional(),
    method: PaymentMethod.optional(),
    dayOfMonth: commitmentFields.dayOfMonth.optional(),
    startsOn: MonthKeySchema.optional(),
    endsOn: MonthKeySchema.nullable().optional(),
    installmentsTotal: commitmentFields.installmentsTotal.nullable().optional(),
    sourceId: UuidSchema.nullable().optional(),
    categoryId: UuidSchema.nullable().optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { error: 'No hay nada para cambiar' });
export type UpdateCommitmentInput = z.input<typeof UpdateCommitmentSchema>;

/** "Pagué": everything is optional, the commitment provides the defaults. */
export const PayCommitmentSchema = z.strictObject({
  amount: PositiveMoneySchema.optional(),
  method: PaymentMethod.optional(),
  occurredAt: IsoDateTimeSchema.optional(),
  commitmentMonth: MonthKeySchema.optional(),
  sourceId: UuidSchema.optional(),
  note: z.string().trim().max(500).optional(),
});
export type PayCommitmentInput = z.input<typeof PayCommitmentSchema>;

export const ListCommitmentsQuerySchema = z.strictObject({
  includeInactive: z.stringbool().optional(),
});
