import { describe, expect, it } from 'vitest';

import {
  artMidnight,
  daysBetween,
  daysInMonth,
  daysLeftInMonth,
  formatIsoDate,
  monthKey,
  parseIsoDate,
  startOfMonth,
  startOfNextMonth,
  toArtCalendarDate,
  todayInArt,
} from '../tz.js';

describe('toArtCalendarDate', () => {
  it('shifts UTC instants to Argentina time', () => {
    // 01:30 UTC on the 22nd is still the 21st at 22:30 in Argentina.
    expect(toArtCalendarDate(new Date('2026-09-22T01:30:00Z'))).toEqual({
      year: 2026,
      month: 9,
      day: 21,
    });
    expect(toArtCalendarDate(new Date('2026-09-22T03:00:00Z'))).toEqual({
      year: 2026,
      month: 9,
      day: 22,
    });
    // New year's eve at 23:00 ART is 02:00 UTC of the next year.
    expect(toArtCalendarDate(new Date('2027-01-01T02:00:00Z'))).toEqual({
      year: 2026,
      month: 12,
      day: 31,
    });
  });

  it('round-trips through artMidnight', () => {
    const midnight = artMidnight({ year: 2026, month: 9, day: 21 });
    expect(midnight.toISOString()).toBe('2026-09-21T03:00:00.000Z');
    expect(toArtCalendarDate(midnight)).toEqual({ year: 2026, month: 9, day: 21 });
    expect(toArtCalendarDate(new Date(midnight.getTime() - 1))).toEqual({
      year: 2026,
      month: 9,
      day: 20,
    });
  });
});

describe('ISO helpers', () => {
  it('formats and parses YYYY-MM-DD', () => {
    expect(formatIsoDate({ year: 2026, month: 1, day: 5 })).toBe('2026-01-05');
    expect(parseIsoDate('2026-01-05')).toEqual({ year: 2026, month: 1, day: 5 });
    expect(() => parseIsoDate('2026-13-01')).toThrow(RangeError);
    expect(() => parseIsoDate('2026-02-29')).toThrow(RangeError);
    expect(() => parseIsoDate('20260101')).toThrow(RangeError);
  });

  it('builds month keys', () => {
    expect(monthKey({ year: 2026, month: 9, day: 21 })).toBe('2026-09');
    expect(monthKey({ year: 2026, month: 12, day: 1 })).toBe('2026-12');
  });
});

describe('month math', () => {
  it('knows the days in each month, including leap years', () => {
    expect(daysInMonth({ year: 2026, month: 2 })).toBe(28);
    expect(daysInMonth({ year: 2028, month: 2 })).toBe(29);
    expect(daysInMonth({ year: 2026, month: 9 })).toBe(30);
    expect(daysInMonth({ year: 2026, month: 12 })).toBe(31);
  });

  it('counts the days left until the 1st including today', () => {
    expect(daysLeftInMonth({ year: 2026, month: 9, day: 21 })).toBe(10);
    expect(daysLeftInMonth({ year: 2026, month: 9, day: 30 })).toBe(1);
    expect(daysLeftInMonth({ year: 2026, month: 9, day: 1 })).toBe(30);
    expect(daysLeftInMonth({ year: 2026, month: 2, day: 28 })).toBe(1);
  });

  it('moves to the start of this and the next month', () => {
    expect(startOfMonth({ year: 2026, month: 9, day: 21 })).toEqual({
      year: 2026,
      month: 9,
      day: 1,
    });
    expect(startOfNextMonth({ year: 2026, month: 9, day: 21 })).toEqual({
      year: 2026,
      month: 10,
      day: 1,
    });
    expect(startOfNextMonth({ year: 2026, month: 12, day: 5 })).toEqual({
      year: 2027,
      month: 1,
      day: 1,
    });
  });

  it('computes whole days between dates', () => {
    expect(daysBetween({ year: 2026, month: 9, day: 21 }, { year: 2026, month: 10, day: 1 })).toBe(
      10,
    );
    expect(daysBetween({ year: 2026, month: 10, day: 1 }, { year: 2026, month: 9, day: 21 })).toBe(
      -10,
    );
    expect(daysBetween({ year: 2026, month: 1, day: 1 }, { year: 2027, month: 1, day: 1 })).toBe(
      365,
    );
  });

  it('todayInArt accepts an injected clock', () => {
    expect(todayInArt(new Date('2026-09-22T01:30:00Z'))).toEqual({ year: 2026, month: 9, day: 21 });
  });
});
