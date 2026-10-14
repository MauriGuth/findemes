import { describe, expect, it } from 'vitest';

import {
  daysLeftForPeriod,
  dueDateInPeriod,
  isIsoInPeriod,
  periodKeyOf,
  periodRange,
} from '../period.js';
import { monthRange } from '../tz.js';

const d = (year: number, month: number, day: number) => ({ year, month, day });

describe('payday periods', () => {
  it('payday 1 is the calendar month', () => {
    expect(periodRange('2026-10', 1)).toEqual(monthRange('2026-10'));
    expect(periodKeyOf(d(2026, 10, 1), 1)).toBe('2026-10');
    expect(daysLeftForPeriod('2026-10', d(2026, 10, 21), 1)).toBe(11);
    expect(dueDateInPeriod(31, '2026-02', 1)).toEqual(d(2026, 2, 28));
  });

  it('runs from payday to payday', () => {
    expect(periodKeyOf(d(2026, 10, 4), 5)).toBe('2026-09');
    expect(periodKeyOf(d(2026, 10, 5), 5)).toBe('2026-10');
    expect(periodKeyOf(d(2026, 1, 3), 5)).toBe('2025-12');
    const range = periodRange('2026-10', 5);
    expect(range.start.toISOString()).toBe('2026-10-05T03:00:00.000Z');
    expect(range.end.toISOString()).toBe('2026-11-05T03:00:00.000Z');
    expect(isIsoInPeriod('2026-11-04', '2026-10', 5)).toBe(true);
    expect(isIsoInPeriod('2026-11-05', '2026-10', 5)).toBe(false);
    expect(isIsoInPeriod('2026-10-04', '2026-10', 5)).toBe(false);
  });

  it('counts the days left until the next payday, today included', () => {
    expect(daysLeftForPeriod('2026-10', d(2026, 11, 4), 5)).toBe(1);
    expect(daysLeftForPeriod('2026-10', d(2026, 10, 5), 5)).toBe(31);
    expect(daysLeftForPeriod('2026-10', d(2026, 11, 5), 5)).toBe(0);
    expect(daysLeftForPeriod('2026-11', d(2026, 10, 20), 5)).toBe(30);
  });

  it('places monthly due days inside the period', () => {
    expect(dueDateInPeriod(10, '2026-10', 5)).toEqual(d(2026, 10, 10));
    expect(dueDateInPeriod(2, '2026-10', 5)).toEqual(d(2026, 11, 2));
    expect(dueDateInPeriod(5, '2026-10', 5)).toEqual(d(2026, 10, 5));
    expect(dueDateInPeriod(31, '2026-01', 5)).toEqual(d(2026, 1, 31));
  });

  it('refuses paydays that do not exist every month', () => {
    expect(() => periodKeyOf(d(2026, 10, 1), 29)).toThrow(RangeError);
    expect(() => periodKeyOf(d(2026, 10, 1), 0)).toThrow(RangeError);
  });
});
