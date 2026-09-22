import { addDays, artMidnight, type CalendarDate } from '../dates/tz.js';
import { formatArs } from '../money/format.js';
import { absMoney, compareMoney, divideMoney } from '../money/money.js';
import { type MonthSummary } from './types.js';

export interface ReminderEntry {
  at: Date;
  title: string;
  body: string;
}

const MS_PER_MINUTE = 60_000;

function parseTime(time: string): { hour: number; minute: number } {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) throw new RangeError(`Invalid reminder time: ${time}`);
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function money(amount: string): string {
  return formatArs(amount, { cents: false });
}

/**
 * The local notifications to schedule from a fresh summary: one per day for the
 * next `horizonDays` days at `time` (Argentina), with the per-day budget recomputed
 * for each day. Stops at the end of the month; the 1st gets a "new month" nudge.
 * Entries already in the past (relative to `now`) are skipped.
 */
export function buildReminderSchedule(
  summary: MonthSummary,
  today: CalendarDate,
  time: string,
  now: Date,
  horizonDays = 7,
): ReminderEntry[] {
  const { hour, minute } = parseTime(time);
  const entries: ReminderEntry[] = [];
  const overspent = compareMoney(summary.remaining, '0.00') <= 0;

  for (let k = 0; k <= horizonDays; k += 1) {
    const day = addDays(today, k);
    const at = new Date(artMidnight(day).getTime() + (hour * 60 + minute) * MS_PER_MINUTE);
    if (at.getTime() <= now.getTime()) continue;

    const daysLeftK = summary.daysLeft - k;
    if (daysLeftK <= 0) {
      if (daysLeftK === 0) {
        entries.push({
          at,
          title: 'Findemes',
          body: 'Empezó un mes nuevo. ¿Cuánto esperás cobrar?',
        });
      }
      break;
    }

    let body: string;
    if (overspent) {
      body = `Te pasaste por ${money(absMoney(summary.remaining))}. Faltan ${String(daysLeftK)} días para el 1.`;
    } else {
      const perDay = divideMoney(summary.remaining, daysLeftK);
      const tail = `Te quedan ${money(summary.remaining)} para ${String(daysLeftK)} días (${money(perDay)} por día).`;
      body =
        k === 0 ? `Hoy: ${money(summary.spent.today)}. ${tail}` : `${tail} ¿Cargaste lo de hoy?`;
    }
    entries.push({ at, title: 'Findemes', body });
  }

  return entries;
}
