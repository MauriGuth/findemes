import { type MonthKey, monthKey, monthsBetween, toArtCalendarDate } from '../dates/tz.js';
import { compareMoney, type MoneyAmount, multiplyMoney, subtractMoney } from '../money/money.js';
import { type PaymentMethod } from '../schemas/enums.js';

/** A movement as the recurring detector sees it. */
export interface RecurringInput {
  id: string;
  amount: MoneyAmount;
  currency: 'ARS' | 'USD';
  direction: 'IN' | 'OUT';
  method: PaymentMethod;
  status: 'PENDING' | 'CONFIRMED' | 'IGNORED';
  isOwnTransfer: boolean;
  commitmentId: string | null;
  merchantRaw: string | null;
  merchantNorm: string | null;
  /** ISO instant */
  occurredAt: string;
}

export interface RecurringSuggestion {
  /** Stable key to dismiss it: the normalized merchant. */
  key: string;
  name: string;
  /** The latest payment's amount. */
  amount: MoneyAmount;
  /** Median day of the month it is paid. */
  dayOfMonth: number;
  method: PaymentMethod;
  /** Distinct months it was paid in the window. */
  months: number;
  transactionIds: string[];
}

/** How many of the last months a payment must appear in. */
export const RECURRING_MIN_MONTHS = 3;
/** Months looked at, counting the current one. */
export const RECURRING_WINDOW_MONTHS = 4;
/** Amounts may move this much around the median (prices change; inflation). */
export const RECURRING_AMOUNT_TOLERANCE = 0.25;
/** Days of the month may wander this much around the median. */
export const RECURRING_DAY_TOLERANCE = 6;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[mid] ?? 0)
    : Math.round(((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2);
}

/** Days of the month on a circle: the 30th and the 2nd are 3 days apart, not 28. */
function dayDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 30 - diff);
}

/** The observed day closest to all the others on that circle (rent on the 30th or the 1st). */
function typicalDay(days: number[]): number {
  let best = days[0] ?? 1;
  let bestCost = Infinity;
  for (const candidate of days) {
    const cost = days.reduce((sum, d) => sum + dayDistance(candidate, d), 0);
    if (cost < bestCost) {
      best = candidate;
      bestCost = cost;
    }
  }
  return best;
}

/**
 * Payments that look like a fixed monthly expense not loaded as a commitment yet (Phase 7):
 * same merchant in at least 3 of the last 4 months, around the same day and amount.
 * Only suggests; the user adds the commitment or dismisses the suggestion.
 */
export function detectRecurring(
  transactions: readonly RecurringInput[],
  options: {
    current: MonthKey;
    /** Normalized names of the user's commitments: never suggested again. */
    knownNames: readonly string[];
    /** Keys the user said no to. */
    dismissed: readonly string[];
  },
): RecurringSuggestion[] {
  const skip = new Set([...options.knownNames, ...options.dismissed]);
  const groups = new Map<string, RecurringInput[]>();
  for (const t of transactions) {
    if (
      t.direction !== 'OUT' ||
      t.currency !== 'ARS' ||
      t.status === 'IGNORED' ||
      t.isOwnTransfer ||
      t.commitmentId !== null ||
      !t.merchantNorm ||
      skip.has(t.merchantNorm)
    ) {
      continue;
    }
    const age = monthsBetween(monthKey(toArtCalendarDate(new Date(t.occurredAt))), options.current);
    if (age < 0 || age >= RECURRING_WINDOW_MONTHS) continue;
    groups.set(t.merchantNorm, [...(groups.get(t.merchantNorm) ?? []), t]);
  }

  const suggestions: RecurringSuggestion[] = [];
  for (const [key, txs] of groups) {
    const sorted = [...txs].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    const days = sorted.map((t) => toArtCalendarDate(new Date(t.occurredAt)).day);
    const day = typicalDay(days);
    const amounts = sorted.map((t) => Number(t.amount));
    const typical = String(median(amounts.map((a) => Math.round(a * 100))) / 100);
    const tolerance = multiplyMoney(typical, RECURRING_AMOUNT_TOLERANCE);
    const fits = sorted.filter((t, i) => {
      const off = subtractMoney(t.amount, typical);
      const abs = off.startsWith('-') ? off.slice(1) : off;
      return (
        compareMoney(abs, tolerance) <= 0 &&
        dayDistance(days[i] ?? 0, day) <= RECURRING_DAY_TOLERANCE
      );
    });
    const months = new Set(fits.map((t) => monthKey(toArtCalendarDate(new Date(t.occurredAt)))));
    if (months.size < RECURRING_MIN_MONTHS) continue;
    const latest = fits.at(-1);
    if (!latest) continue;
    const methods = new Map<PaymentMethod, number>();
    for (const t of fits) methods.set(t.method, (methods.get(t.method) ?? 0) + 1);
    const method = [...methods.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? latest.method;
    suggestions.push({
      key,
      name: latest.merchantRaw ?? key,
      amount: latest.amount,
      dayOfMonth: Math.min(28, Math.max(1, day)),
      method,
      months: months.size,
      transactionIds: fits.map((t) => t.id),
    });
  }
  return suggestions.sort((a, b) => compareMoney(b.amount, a.amount));
}
