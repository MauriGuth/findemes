import {
  addDays,
  artMidnight,
  type CalendarDate,
  daysBetween,
  formatIsoDate,
  type MonthKey,
  monthKey,
  parseMonthKey,
  toArtCalendarDate,
  todayInArt,
} from '@findemes/shared';

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function currentMonthKey(): MonthKey {
  return monthKey(todayInArt());
}

/** "octubre 2026" */
export function monthName(key: MonthKey): string {
  const { year, month } = parseMonthKey(key);
  return `${MONTHS[month - 1] ?? ''} ${String(year)}`;
}

/** "4/9" */
export function shortDate(date: CalendarDate): string {
  return `${String(date.day)}/${String(date.month)}`;
}

/** "Hoy", "Ayer", "vie 18/9" for grouping movements. */
export function dayLabel(date: CalendarDate, today: CalendarDate = todayInArt()): string {
  const diff = daysBetween(date, today);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  const weekday =
    WEEKDAYS[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()] ?? '';
  return `${weekday} ${shortDate(date)}`;
}

export function isoToCalendar(iso: string): CalendarDate {
  return toArtCalendarDate(new Date(iso));
}

export function calendarKey(date: CalendarDate): string {
  return formatIsoDate(date);
}

/** Noon in Argentina of a calendar day, as an ISO instant (for movements loaded on another day). */
export function noonOf(date: CalendarDate): string {
  return new Date(artMidnight(date).getTime() + 12 * 3_600_000).toISOString();
}

/** The last `count` days, today first. */
export function recentDays(count: number, today: CalendarDate = todayInArt()): CalendarDate[] {
  return Array.from({ length: count }, (_, i) => addDays(today, -i));
}
