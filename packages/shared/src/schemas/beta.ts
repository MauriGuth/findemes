import { z } from 'zod';

import { MoneyAmountSchema, MonthKeySchema, UuidSchema } from './common.js';
import { PaymentMethod } from './enums.js';

/** A payment that looks monthly and is not a commitment yet (Phase 7). */
export const RecurringSuggestionSchema = z
  .object({
    key: z.string(),
    name: z.string(),
    amount: MoneyAmountSchema,
    dayOfMonth: z.number().int().min(1).max(28),
    method: PaymentMethod,
    months: z.number().int(),
    transactionIds: z.array(UuidSchema),
  })
  .meta({ id: 'RecurringSuggestion' });
export type RecurringSuggestionDto = z.infer<typeof RecurringSuggestionSchema>;

export const RecurringSuggestionListSchema = z
  .object({ items: z.array(RecurringSuggestionSchema) })
  .meta({ id: 'RecurringSuggestionList' });

export const DismissRecurringSchema = z.strictObject({ key: z.string().min(1).max(200) });
export type DismissRecurringInput = z.input<typeof DismissRecurringSchema>;

/** CSV export of movements, by month range (inclusive). */
export const ExportQuerySchema = z.strictObject({
  from: MonthKeySchema,
  to: MonthKeySchema,
});
export type ExportQuery = z.infer<typeof ExportQuerySchema>;
