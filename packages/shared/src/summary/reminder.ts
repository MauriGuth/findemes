import { addDays, artMidnight, type CalendarDate } from '../dates/tz.js';
import { formatArs, formatMoney } from '../money/format.js';
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
          body:
            summary.payday === 1
              ? 'Empezó un mes nuevo. ¿Cuánto esperás cobrar?'
              : 'Hoy cobrás: empieza tu mes nuevo. ¿Cuánto esperás cobrar?',
        });
      }
      break;
    }

    let body: string;
    if (overspent) {
      body = `Te pasaste por ${money(absMoney(summary.remaining))}. Faltan ${String(daysLeftK)} días ${summary.payday === 1 ? 'para el 1' : 'para que cobrés'}.`;
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

/** What the app needs from a bill to remind about it. */
export interface BillReminderInput {
  id: string;
  issuer: string;
  amount: string;
  /** "YYYY-MM-DD" */
  dueOn: string;
  status: 'PENDING' | 'UNPAID' | 'PAID' | 'IGNORED';
  currency?: 'ARS' | 'USD';
}

const BILL_REMINDER_HOUR = 10;

/**
 * Local notifications for "Por pagar" (ADR 013): the day before and the morning of each
 * unpaid due date, at 10:00 Argentina, within `horizonDays`. Past entries are skipped.
 */
export function buildBillReminders(
  bills: readonly BillReminderInput[],
  today: CalendarDate,
  now: Date,
  horizonDays = 14,
): ReminderEntry[] {
  const last = artMidnight(addDays(today, horizonDays + 1)).getTime();
  const entries: ReminderEntry[] = [];
  for (const bill of bills) {
    if (bill.status !== 'PENDING' && bill.status !== 'UNPAID') continue;
    const [year, month, day] = bill.dueOn.split('-').map(Number);
    if (!year || !month || !day) continue;
    const due = { year, month, day };
    const at = (date: CalendarDate) =>
      new Date(artMidnight(date).getTime() + BILL_REMINDER_HOUR * 60 * MS_PER_MINUTE);
    const amount =
      bill.currency === 'USD'
        ? formatMoney(bill.amount, { currency: 'USD', cents: false })
        : money(bill.amount);
    for (const entry of [
      { at: at(addDays(due, -1)), title: `Mañana vence ${bill.issuer}` },
      { at: at(due), title: `Hoy vence ${bill.issuer}` },
    ]) {
      if (entry.at.getTime() <= now.getTime() || entry.at.getTime() >= last) continue;
      entries.push({
        at: entry.at,
        title: entry.title,
        body: `${amount}. Si ya lo pagaste, marcalo en Tu mes.`,
      });
    }
  }
  return entries.sort((a, b) => a.at.getTime() - b.at.getTime());
}
