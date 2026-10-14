import {
  addMonths,
  artMidnight,
  type CalendarDate,
  clampDayOfMonth,
  daysBetween,
  formatIsoDate,
  type IsoDate,
  type MonthKey,
  monthKey,
  parseIsoDate,
  parseMonthKey,
  previousMonthKey,
  toArtCalendarDate,
} from './tz.js';

/**
 * "Hasta que cobrés" (ADR 007 amendment, Phase 5): the user's month runs from payday to
 * payday. Period `M` with payday `p` is [p of M, p of M+1). Payday 1 is the calendar month,
 * so everything written for calendar months still holds. Payday is 1..28, so it exists in
 * every month.
 */
export const MIN_PAYDAY = 1;
export const MAX_PAYDAY = 28;

function checkPayday(payday: number): number {
  if (!Number.isInteger(payday) || payday < MIN_PAYDAY || payday > MAX_PAYDAY) {
    throw new RangeError(`Invalid payday: ${String(payday)}`);
  }
  return payday;
}

/** First day of period `key`. */
export function periodStart(key: MonthKey, payday = 1): CalendarDate {
  return { ...parseMonthKey(key), day: checkPayday(payday) };
}

/** First day of the next period (exclusive end). */
export function periodEnd(key: MonthKey, payday = 1): CalendarDate {
  return addMonths(periodStart(key, payday), 1);
}

/** [00:00 ART of the start, 00:00 ART of the next start). */
export function periodRange(key: MonthKey, payday = 1): { start: Date; end: Date } {
  return { start: artMidnight(periodStart(key, payday)), end: artMidnight(periodEnd(key, payday)) };
}

export function isInPeriod(instant: Date, key: MonthKey, payday = 1): boolean {
  const { start, end } = periodRange(key, payday);
  return instant.getTime() >= start.getTime() && instant.getTime() < end.getTime();
}

export function isIsoInPeriod(iso: IsoDate, key: MonthKey, payday = 1): boolean {
  return (
    iso >= formatIsoDate(periodStart(key, payday)) && iso < formatIsoDate(periodEnd(key, payday))
  );
}

/** The period a calendar date belongs to: before payday it is still last month's. */
export function periodKeyOf(date: CalendarDate, payday = 1): MonthKey {
  const key = monthKey(date);
  return date.day >= checkPayday(payday) ? key : previousMonthKey(key);
}

export function periodKeyOfInstant(instant: Date, payday = 1): MonthKey {
  return periodKeyOf(toArtCalendarDate(instant), payday);
}

export function periodKeyOfIso(iso: IsoDate, payday = 1): MonthKey {
  return periodKeyOf(parseIsoDate(iso), payday);
}

/**
 * Days left to stretch the money in period `key` from `today`, counting today: 0 for a
 * past period, every day for a future one.
 */
export function daysLeftForPeriod(key: MonthKey, today: CalendarDate, payday = 1): number {
  const start = periodStart(key, payday);
  const end = periodEnd(key, payday);
  if (daysBetween(today, end) <= 0) return 0;
  if (daysBetween(start, today) < 0) return daysBetween(start, end);
  return daysBetween(today, end);
}

/**
 * When a monthly due day falls inside period `key`: days on or after payday fall in the
 * period's first calendar month, earlier days in the next one (rent due on the 10th, paid
 * on the 5th: due the 10th of the same month; due on the 2nd: the 2nd of next month).
 */
export function dueDateInPeriod(dayOfMonth: number, key: MonthKey, payday = 1): CalendarDate {
  const start = periodStart(key, payday);
  return dayOfMonth >= payday
    ? clampDayOfMonth(dayOfMonth, start)
    : clampDayOfMonth(dayOfMonth, addMonths({ ...start, day: 1 }, 1));
}
