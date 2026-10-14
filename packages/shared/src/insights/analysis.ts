import { periodStart } from '../dates/period.js';
import { type CalendarDate, daysBetween, type MonthKey, toArtCalendarDate } from '../dates/tz.js';
import {
  addMoney,
  compareMoney,
  divideMoney,
  type MoneyAmount,
  subtractMoney,
  sumMoney,
} from '../money/money.js';
import { type Budget, type Stats } from '../schemas/budget.js';
import {
  type Currency,
  type TransactionDirection,
  type TransactionStatus,
} from '../schemas/enums.js';

/** What the analysis needs from a movement. */
export interface AnalysisTransaction {
  amount: MoneyAmount;
  currency: Currency;
  direction: TransactionDirection;
  status: TransactionStatus;
  isOwnTransfer: boolean;
  isStatementPayment: boolean;
  categoryId: string | null;
  /** ISO instant */
  occurredAt: string;
}

const ZERO: MoneyAmount = '0.00';

/**
 * Spending, as budgets and statistics see it: ARS expenses not ignored, not between own
 * accounts and not a card statement payment (its purchases already counted on the credit
 * side). Cash and credit both count: a budget is about what you buy, not when it is paid.
 */
export function isSpending(t: AnalysisTransaction): boolean {
  return (
    t.direction === 'OUT' &&
    t.currency === 'ARS' &&
    t.status !== 'IGNORED' &&
    !t.isOwnTransfer &&
    !t.isStatementPayment
  );
}

function ratio(part: MoneyAmount, whole: MoneyAmount): number {
  if (compareMoney(whole, ZERO) <= 0) return 0;
  return Math.round((Number(part) / Number(whole)) * 100) / 100;
}

/** Each budget with what was spent in its category this period. */
export function computeBudgets(
  budgets: readonly { id: string; categoryId: string; amount: MoneyAmount }[],
  transactions: readonly AnalysisTransaction[],
): Budget[] {
  const spending = transactions.filter(isSpending);
  return budgets.map((b) => {
    const spent = sumMoney(
      spending.filter((t) => t.categoryId === b.categoryId).map((t) => t.amount),
    );
    return {
      id: b.id,
      categoryId: b.categoryId,
      amount: b.amount,
      spent,
      remaining: subtractMoney(b.amount, spent),
      ratio: ratio(spent, b.amount),
    };
  });
}

/** Thresholds that trigger a budget alert, in order. */
export const BUDGET_ALERT_LEVELS = [80, 100] as const;

/** The highest threshold reached (0 when none). */
export function budgetAlertLevel(budget: Pick<Budget, 'ratio'>): number {
  return [...BUDGET_ALERT_LEVELS].reverse().find((level) => budget.ratio * 100 >= level) ?? 0;
}

/**
 * Statistics of period `month` up to `today` (Phase 5): daily average, categories, the
 * weekday with most spending, and the previous period over the same number of days.
 * Nominal amounts: no inflation adjustment (the app says so).
 */
export function computeStats(input: {
  month: MonthKey;
  previousMonth: MonthKey;
  payday: number;
  today: CalendarDate;
  current: readonly AnalysisTransaction[];
  previous: readonly AnalysisTransaction[];
}): Stats {
  const start = periodStart(input.month, input.payday);
  const elapsed = Math.max(1, daysBetween(start, input.today) + 1);
  const spending = input.current.filter(isSpending);
  const spent = sumMoney(spending.map((t) => t.amount));

  const byCategoryMap = new Map<string | null, MoneyAmount>();
  for (const t of spending) {
    byCategoryMap.set(t.categoryId, addMoney(byCategoryMap.get(t.categoryId) ?? ZERO, t.amount));
  }
  const byCategory = [...byCategoryMap.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount, share: ratio(amount, spent) }))
    .sort((a, b) => compareMoney(b.amount, a.amount));

  const byWeekday = new Map<number, MoneyAmount>();
  for (const t of spending) {
    const day = toArtCalendarDate(new Date(t.occurredAt));
    const weekday = new Date(Date.UTC(day.year, day.month - 1, day.day)).getUTCDay();
    byWeekday.set(weekday, addMoney(byWeekday.get(weekday) ?? ZERO, t.amount));
  }
  let topWeekday: Stats['topWeekday'] = null;
  for (const [weekday, amount] of byWeekday) {
    if (!topWeekday || compareMoney(amount, topWeekday.amount) > 0)
      topWeekday = { weekday, amount };
  }

  const previousStart = periodStart(input.previousMonth, input.payday);
  const sameDays = sumMoney(
    input.previous
      .filter(isSpending)
      .filter((t) => {
        const day = toArtCalendarDate(new Date(t.occurredAt));
        const offset = daysBetween(previousStart, day);
        return offset >= 0 && offset < elapsed;
      })
      .map((t) => t.amount),
  );

  return {
    month: input.month,
    spent,
    dailyAverage: divideMoney(spent, elapsed),
    byCategory,
    topWeekday,
    previous: {
      month: input.previousMonth,
      sameDays,
      change:
        compareMoney(sameDays, ZERO) > 0
          ? Math.round(((Number(spent) - Number(sameDays)) / Number(sameDays)) * 100) / 100
          : null,
    },
  };
}
