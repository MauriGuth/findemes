import { dueDateInPeriod } from '../dates/period.js';
import {
  addMonths,
  compareMonthKey,
  formatIsoDate,
  type IsoDate,
  type MonthKey,
  monthKeyOfIso,
  monthsBetween,
  parseIsoDate,
} from '../dates/tz.js';
import { type PaymentMethod } from '../schemas/enums.js';
import { type SummaryCommitmentInput } from './types.js';

type ScheduleInput = Pick<
  SummaryCommitmentInput,
  'active' | 'startsOn' | 'endsOn' | 'dayOfMonth' | 'installmentsTotal'
>;

/** Whether the commitment has a due installment in `month` (calendar-derived, no counters). */
export function commitmentAppliesToMonth(c: ScheduleInput, month: MonthKey): boolean {
  if (!c.active) return false;
  if (compareMonthKey(monthKeyOfIso(c.startsOn), month) > 0) return false;
  if (c.endsOn !== null && compareMonthKey(monthKeyOfIso(c.endsOn), month) < 0) return false;
  return true;
}

export interface CommitmentMonthState {
  dueOn: IsoDate;
  installmentNumber: number | null;
  installmentsLeft: number | null;
}

/**
 * Due date and "installment N of M" for a given month (or payday period: with payday p the
 * due day falls inside [p of month, p of next month)).
 */
export function commitmentMonthState(
  c: ScheduleInput,
  month: MonthKey,
  payday = 1,
): CommitmentMonthState {
  const dueOn = formatIsoDate(dueDateInPeriod(c.dayOfMonth, month, payday));
  if (c.installmentsTotal === null) {
    return { dueOn, installmentNumber: null, installmentsLeft: null };
  }
  const installmentNumber = monthsBetween(monthKeyOfIso(c.startsOn), month) + 1;
  return { dueOn, installmentNumber, installmentsLeft: c.installmentsTotal - installmentNumber };
}

/** Last month of an installment plan: startsOn + (total − 1) months, as the 1st of that month. */
export function installmentsEndsOn(startsOn: IsoDate, installmentsTotal: number): IsoDate {
  const start = parseIsoDate(startsOn);
  const end = addMonths({ year: start.year, month: start.month, day: 1 }, installmentsTotal - 1);
  return formatIsoDate(end);
}

/** Debit, transfer, wallet and cash leave the money this month; credit goes to the statement. */
export function commitmentIsCash(method: PaymentMethod): boolean {
  return method !== 'CREDIT';
}
