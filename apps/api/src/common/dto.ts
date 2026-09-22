import {
  dateColumnToIso,
  type IsoDate,
  isoToDateColumn,
  type MoneyAmount,
  type MonthKey,
} from '@findemes/shared';

import { type Prisma } from '../generated/prisma/client.js';

/** Decimal columns leave the API as strings with two decimals. Never as numbers. */
export function toMoney(value: Prisma.Decimal | { toFixed(digits: number): string }): MoneyAmount {
  return value.toFixed(2);
}

export function toIso(value: Date): string {
  return value.toISOString();
}

/** DATE column (00:00 UTC) → "YYYY-MM-DD". Never through Argentina-time helpers. */
export function dateToIso(value: Date): IsoDate {
  return dateColumnToIso(value);
}

/** DATE column holding the 1st of a month → "YYYY-MM". */
export function dateToMonthKey(value: Date): MonthKey {
  return dateColumnToIso(value).slice(0, 7);
}

/** "YYYY-MM" → DATE column holding the 1st of that month. */
export function monthKeyToDate(key: MonthKey): Date {
  return isoToDateColumn(`${key}-01`);
}
