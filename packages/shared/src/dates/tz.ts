/**
 * All calendar logic in Findemes happens in Argentina time.
 *
 * Argentina (America/Argentina/Buenos_Aires) has been fixed at UTC-3 with no
 * daylight saving since 2009, so the offset is a constant. Computing calendar
 * dates by shifting the UTC clock keeps this module free of Intl (Hermes ships
 * the device's ICU data, which varies by OS version) and free of date libraries.
 */
export const ART_TIME_ZONE = 'America/Argentina/Buenos_Aires';
export const ART_UTC_OFFSET_MINUTES = -180;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

export interface CalendarDate {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

/** YYYY-MM-DD */
export type IsoDate = string;
/** YYYY-MM */
export type MonthKey = string;

function pad2(n: number): string {
  return n < 10 ? `0${String(n)}` : String(n);
}

/** Calendar date of an instant, as seen from Argentina. */
export function toArtCalendarDate(instant: Date): CalendarDate {
  const shifted = new Date(instant.getTime() + ART_UTC_OFFSET_MINUTES * MS_PER_MINUTE);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/** The instant at which a calendar day starts (00:00) in Argentina. */
export function artMidnight({ year, month, day }: CalendarDate): Date {
  return new Date(Date.UTC(year, month - 1, day) - ART_UTC_OFFSET_MINUTES * MS_PER_MINUTE);
}

export function formatIsoDate({ year, month, day }: CalendarDate): IsoDate {
  return `${String(year)}-${pad2(month)}-${pad2(day)}`;
}

export function parseIsoDate(iso: IsoDate): CalendarDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new RangeError(`Invalid ISO date: ${iso}`);
  const [, y, m, d] = match;
  const date: CalendarDate = { year: Number(y), month: Number(m), day: Number(d) };
  if (date.month < 1 || date.month > 12 || date.day < 1 || date.day > daysInMonth(date)) {
    throw new RangeError(`Invalid ISO date: ${iso}`);
  }
  return date;
}

export function monthKey({ year, month }: CalendarDate): MonthKey {
  return `${String(year)}-${pad2(month)}`;
}

export function daysInMonth({ year, month }: Pick<CalendarDate, 'year' | 'month'>): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function startOfMonth(date: CalendarDate): CalendarDate {
  return { year: date.year, month: date.month, day: 1 };
}

export function startOfNextMonth(date: CalendarDate): CalendarDate {
  return date.month === 12
    ? { year: date.year + 1, month: 1, day: 1 }
    : { year: date.year, month: date.month + 1, day: 1 };
}

/**
 * Days left in the month counting today: on the 21st of a 30-day month there
 * are 10 days (21..30) to stretch the money until the 1st.
 */
export function daysLeftInMonth(date: CalendarDate): number {
  return daysInMonth(date) - date.day + 1;
}

/** Whole days between two calendar dates (b - a). */
export function daysBetween(a: CalendarDate, b: CalendarDate): number {
  return Math.round((artMidnight(b).getTime() - artMidnight(a).getTime()) / MS_PER_DAY);
}

export function todayInArt(now: Date = new Date()): CalendarDate {
  return toArtCalendarDate(now);
}

// ─── Month keys and month math ───────────────────────────────────────────────

export function parseMonthKey(key: MonthKey): CalendarDate {
  const match = /^(\d{4})-(\d{2})$/.exec(key);
  if (!match) throw new RangeError(`Invalid month key: ${key}`);
  const [, y, m] = match;
  const month = Number(m);
  if (month < 1 || month > 12) throw new RangeError(`Invalid month key: ${key}`);
  return { year: Number(y), month, day: 1 };
}

/** Month key ("YYYY-MM") of an ISO date ("YYYY-MM-DD"). */
export function monthKeyOfIso(iso: IsoDate): MonthKey {
  return monthKey(parseIsoDate(iso));
}

/** Adds (or subtracts) months, clamping the day: 31/1 + 1 month = 28 or 29/2. */
export function addMonths(date: CalendarDate, n: number): CalendarDate {
  const total = date.year * 12 + (date.month - 1) + n;
  const year = Math.floor(total / 12);
  const month = total - year * 12 + 1;
  return { year, month, day: Math.min(date.day, daysInMonth({ year, month })) };
}

/** Whole months from a to b (b − a): monthsBetween('2026-06', '2026-09') = 3. */
export function monthsBetween(a: MonthKey, b: MonthKey): number {
  const pa = parseMonthKey(a);
  const pb = parseMonthKey(b);
  return (pb.year - pa.year) * 12 + (pb.month - pa.month);
}

export function compareMonthKey(a: MonthKey, b: MonthKey): -1 | 0 | 1 {
  const diff = monthsBetween(b, a);
  return diff < 0 ? -1 : diff > 0 ? 1 : 0;
}

export function previousMonthKey(key: MonthKey): MonthKey {
  return monthKey(addMonths(parseMonthKey(key), -1));
}

export function nextMonthKey(key: MonthKey): MonthKey {
  return monthKey(addMonths(parseMonthKey(key), 1));
}

export function endOfMonth(date: CalendarDate): CalendarDate {
  return { year: date.year, month: date.month, day: daysInMonth(date) };
}

/** Day `day` of the given month, pulled back to the last day of shorter months. */
export function clampDayOfMonth(
  day: number,
  month: Pick<CalendarDate, 'year' | 'month'>,
): CalendarDate {
  const last = daysInMonth(month);
  return {
    year: month.year,
    month: month.month,
    day: Math.min(Math.max(1, Math.trunc(day)), last),
  };
}

export function addDays(date: CalendarDate, n: number): CalendarDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + n));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

// ─── Ranges (half-open, in Argentina time) ──────────────────────────────────

/** [00:00 ART of the 1st, 00:00 ART of the next 1st). */
export function monthRange(key: MonthKey): { start: Date; end: Date } {
  const first = parseMonthKey(key);
  return { start: artMidnight(first), end: artMidnight(startOfNextMonth(first)) };
}

/** [00:00 ART, 00:00 ART of the next day). */
export function dayRange(date: CalendarDate): { start: Date; end: Date } {
  return { start: artMidnight(date), end: artMidnight(addDays(date, 1)) };
}

export function isInArtMonth(instant: Date, key: MonthKey): boolean {
  const { start, end } = monthRange(key);
  return instant.getTime() >= start.getTime() && instant.getTime() < end.getTime();
}

export function isInArtDay(instant: Date, date: CalendarDate): boolean {
  const { start, end } = dayRange(date);
  return instant.getTime() >= start.getTime() && instant.getTime() < end.getTime();
}

/**
 * Days left to stretch the money in month `key` as seen from `today`:
 * the current month counts today; a past month has 0; a future month has all its days.
 */
export function daysLeftForMonth(key: MonthKey, today: CalendarDate): number {
  const cmp = compareMonthKey(key, monthKey(today));
  if (cmp < 0) return 0;
  if (cmp > 0) return daysInMonth(parseMonthKey(key));
  return daysLeftInMonth(today);
}

// ─── DATE columns ────────────────────────────────────────────────────────────
//
// Postgres DATE columns come back from the pg adapter as a Date at 00:00 UTC.
// They are calendar dates, not instants: convert them ONLY with UTC getters.
// Passing them through toArtCalendarDate would shift them one day (and month) back.

export function dateColumnToIso(value: Date): IsoDate {
  return value.toISOString().slice(0, 10);
}

export function isoToDateColumn(iso: IsoDate): Date {
  parseIsoDate(iso); // validates
  return new Date(`${iso}T00:00:00Z`);
}
