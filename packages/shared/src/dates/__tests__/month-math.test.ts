import { describe, expect, it } from 'vitest';

import {
  addDays,
  addMonths,
  clampDayOfMonth,
  compareMonthKey,
  dateColumnToIso,
  dayRange,
  daysLeftForMonth,
  endOfMonth,
  isInArtDay,
  isInArtMonth,
  isoToDateColumn,
  monthKeyOfIso,
  monthRange,
  monthsBetween,
  nextMonthKey,
  parseMonthKey,
  previousMonthKey,
} from '../tz.js';

describe('month keys', () => {
  it('parses and validates YYYY-MM', () => {
    expect(parseMonthKey('2026-09')).toEqual({ year: 2026, month: 9, day: 1 });
    expect(() => parseMonthKey('2026-13')).toThrow(RangeError);
    expect(() => parseMonthKey('2026-9')).toThrow(RangeError);
    expect(monthKeyOfIso('2026-09-21')).toBe('2026-09');
  });

  it('adds months clamping the day', () => {
    expect(addMonths({ year: 2026, month: 1, day: 31 }, 1)).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
    expect(addMonths({ year: 2028, month: 1, day: 31 }, 1)).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
    expect(addMonths({ year: 2026, month: 12, day: 15 }, 1)).toEqual({
      year: 2027,
      month: 1,
      day: 15,
    });
    expect(addMonths({ year: 2026, month: 1, day: 15 }, -1)).toEqual({
      year: 2025,
      month: 12,
      day: 15,
    });
    expect(addMonths({ year: 2026, month: 6, day: 1 }, 5)).toEqual({
      year: 2026,
      month: 11,
      day: 1,
    });
  });

  it('counts months between keys and compares them', () => {
    expect(monthsBetween('2026-06', '2026-09')).toBe(3);
    expect(monthsBetween('2026-09', '2026-06')).toBe(-3);
    expect(monthsBetween('2025-11', '2026-02')).toBe(3);
    expect(compareMonthKey('2026-09', '2026-09')).toBe(0);
    expect(compareMonthKey('2026-08', '2026-09')).toBe(-1);
    expect(compareMonthKey('2027-01', '2026-12')).toBe(1);
    expect(previousMonthKey('2026-01')).toBe('2025-12');
    expect(nextMonthKey('2026-12')).toBe('2027-01');
  });

  it('clamps due days and finds month ends', () => {
    expect(clampDayOfMonth(31, { year: 2026, month: 9 })).toEqual({
      year: 2026,
      month: 9,
      day: 30,
    });
    expect(clampDayOfMonth(31, { year: 2028, month: 2 })).toEqual({
      year: 2028,
      month: 2,
      day: 29,
    });
    expect(clampDayOfMonth(10, { year: 2026, month: 9 })).toEqual({
      year: 2026,
      month: 9,
      day: 10,
    });
    expect(clampDayOfMonth(0, { year: 2026, month: 9 })).toEqual({ year: 2026, month: 9, day: 1 });
    expect(endOfMonth({ year: 2026, month: 2, day: 3 })).toEqual({ year: 2026, month: 2, day: 28 });
    expect(addDays({ year: 2026, month: 9, day: 30 }, 1)).toEqual({
      year: 2026,
      month: 10,
      day: 1,
    });
    expect(addDays({ year: 2026, month: 1, day: 1 }, -1)).toEqual({
      year: 2025,
      month: 12,
      day: 31,
    });
  });
});

describe('ranges in Argentina time', () => {
  it('monthRange is half-open at 03:00Z', () => {
    const { start, end } = monthRange('2026-09');
    expect(start.toISOString()).toBe('2026-09-01T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(isInArtMonth(new Date('2026-10-01T02:30:00Z'), '2026-09')).toBe(true);
    expect(isInArtMonth(new Date('2026-10-01T03:00:00Z'), '2026-09')).toBe(false);
    expect(isInArtMonth(new Date('2026-09-01T02:59:59Z'), '2026-09')).toBe(false);
  });

  it('dayRange covers one ART day', () => {
    const today = { year: 2026, month: 9, day: 21 };
    const { start, end } = dayRange(today);
    expect(start.toISOString()).toBe('2026-09-21T03:00:00.000Z');
    expect(end.toISOString()).toBe('2026-09-22T03:00:00.000Z');
    expect(isInArtDay(new Date('2026-09-21T11:00:00Z'), today)).toBe(true); // 08:00 ART
    expect(isInArtDay(new Date('2026-09-22T02:59:00Z'), today)).toBe(true); // 23:59 ART
    expect(isInArtDay(new Date('2026-09-21T02:59:00Z'), today)).toBe(false); // 20/9 23:59 ART
  });

  it('daysLeftForMonth depends on where today falls', () => {
    const today = { year: 2026, month: 9, day: 21 };
    expect(daysLeftForMonth('2026-09', today)).toBe(10);
    expect(daysLeftForMonth('2026-08', today)).toBe(0);
    expect(daysLeftForMonth('2026-10', today)).toBe(31);
  });
});

describe('DATE columns', () => {
  it('round-trips through UTC and never shifts a day', () => {
    expect(dateColumnToIso(new Date('2026-10-01T00:00:00Z'))).toBe('2026-10-01');
    expect(isoToDateColumn('2026-10-01').toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(dateColumnToIso(isoToDateColumn('2026-02-28'))).toBe('2026-02-28');
    expect(() => isoToDateColumn('2026-02-30')).toThrow(RangeError);
  });
});
