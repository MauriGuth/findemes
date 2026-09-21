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
