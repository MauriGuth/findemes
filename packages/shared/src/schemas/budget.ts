import { z } from 'zod';

import { MoneyAmountSchema, MonthKeySchema, PositiveMoneySchema, UuidSchema } from './common.js';

/** A monthly spending limit for one category, and how it is going this period (Phase 5). */
export const BudgetSchema = z
  .object({
    id: UuidSchema,
    categoryId: UuidSchema,
    amount: MoneyAmountSchema,
    /** Spent in the category this period (ARS, cash and credit, pending included). */
    spent: MoneyAmountSchema,
    remaining: MoneyAmountSchema,
    /** spent / amount, 0..∞, two decimals. */
    ratio: z.number().min(0),
  })
  .meta({ id: 'Budget' });
export type Budget = z.infer<typeof BudgetSchema>;

export const BudgetListSchema = z
  .object({ month: MonthKeySchema, items: z.array(BudgetSchema) })
  .meta({ id: 'BudgetList' });

export const UpsertBudgetSchema = z.strictObject({
  categoryId: UuidSchema,
  amount: PositiveMoneySchema,
});
export type UpsertBudgetInput = z.input<typeof UpsertBudgetSchema>;

/** Numbers for the analysis screen (Phase 5). Nominal: no inflation adjustment. */
export const StatsSchema = z
  .object({
    month: MonthKeySchema,
    /** Spent (ARS, cash + credit) in the period up to today. */
    spent: MoneyAmountSchema,
    /** spent / days elapsed. */
    dailyAverage: MoneyAmountSchema,
    byCategory: z.array(
      z.object({ categoryId: UuidSchema.nullable(), amount: MoneyAmountSchema, share: z.number() }),
    ),
    /** 0 = domingo … 6 = sábado; null without expenses. */
    topWeekday: z
      .object({ weekday: z.number().int().min(0).max(6), amount: MoneyAmountSchema })
      .nullable(),
    previous: z.object({
      month: MonthKeySchema,
      /** Spent in the previous period up to the same day of the period. */
      sameDays: MoneyAmountSchema,
      /** (spent − sameDays) / sameDays; null when the previous period had nothing. */
      change: z.number().nullable(),
    }),
  })
  .meta({ id: 'Stats' });
export type Stats = z.infer<typeof StatsSchema>;

export const PushTokenSchema = z.strictObject({
  /** "ExponentPushToken[…]"; null when the user turned push off on this phone. */
  token: z
    .string()
    .regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/, { error: 'Token inválido' })
    .nullable(),
});
export type PushTokenInput = z.input<typeof PushTokenSchema>;
