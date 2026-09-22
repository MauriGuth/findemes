import { z } from 'zod';

import { MONEY_AMOUNT_REGEX } from '../money/money.js';

/** Decimal string with up to two decimals: "1234.56". Money never travels as a float. */
export const MoneyAmountSchema = z
  .string()
  .regex(MONEY_AMOUNT_REGEX, 'El monto tiene que ser un número con hasta dos decimales');
export type MoneyAmountInput = z.infer<typeof MoneyAmountSchema>;

export const UuidSchema = z.uuid({ error: 'Identificador inválido' });

export const IsoDateTimeSchema = z.iso.datetime({ offset: true, error: 'Fecha y hora inválidas' });

export const IsoDateSchema = z.iso.date({ error: 'Fecha inválida' });

export const MonthKeySchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'El mes tiene que tener el formato AAAA-MM');

/** Amount strictly greater than zero. */
export const PositiveMoneySchema = MoneyAmountSchema.refine(
  (value) => !value.startsWith('-') && /[1-9]/.test(value),
  {
    error: 'El monto tiene que ser mayor a cero',
  },
);

/** Amount greater than or equal to zero. */
export const NonNegativeMoneySchema = MoneyAmountSchema.refine((value) => !value.startsWith('-'), {
  error: 'El monto no puede ser negativo',
});
