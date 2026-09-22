import { describe, expect, it } from 'vitest';

import {
  commitmentAppliesToMonth,
  commitmentIsCash,
  commitmentMonthState,
  installmentsEndsOn,
} from '../commitment-schedule.js';

const heladera = {
  active: true,
  startsOn: '2026-06-01',
  endsOn: '2026-11-01',
  dayOfMonth: 15,
  installmentsTotal: 6,
};

describe('commitment schedule', () => {
  it('applies only between startsOn and endsOn while active', () => {
    expect(commitmentAppliesToMonth(heladera, '2026-05')).toBe(false);
    expect(commitmentAppliesToMonth(heladera, '2026-06')).toBe(true);
    expect(commitmentAppliesToMonth(heladera, '2026-09')).toBe(true);
    expect(commitmentAppliesToMonth(heladera, '2026-11')).toBe(true);
    expect(commitmentAppliesToMonth(heladera, '2026-12')).toBe(false);
    expect(commitmentAppliesToMonth({ ...heladera, active: false }, '2026-09')).toBe(false);
    expect(commitmentAppliesToMonth({ ...heladera, endsOn: null }, '2030-01')).toBe(true);
  });

  it('derives "installment 4 of 6" from the calendar', () => {
    expect(commitmentMonthState(heladera, '2026-09')).toEqual({
      dueOn: '2026-09-15',
      installmentNumber: 4,
      installmentsLeft: 2,
    });
    expect(commitmentMonthState(heladera, '2026-06').installmentNumber).toBe(1);
    expect(commitmentMonthState(heladera, '2026-11').installmentsLeft).toBe(0);
  });

  it('clamps the due day and leaves installment fields null for open commitments', () => {
    expect(
      commitmentMonthState({ ...heladera, installmentsTotal: null, dayOfMonth: 31 }, '2026-09'),
    ).toEqual({
      dueOn: '2026-09-30',
      installmentNumber: null,
      installmentsLeft: null,
    });
  });

  it('computes the last installment month', () => {
    expect(installmentsEndsOn('2026-06-01', 6)).toBe('2026-11-01');
    expect(installmentsEndsOn('2026-09-21', 1)).toBe('2026-09-01');
    expect(installmentsEndsOn('2026-11-01', 3)).toBe('2027-01-01');
  });

  it('only credit skips the cash', () => {
    expect(commitmentIsCash('CREDIT')).toBe(false);
    for (const m of ['DEBIT', 'TRANSFER', 'CASH', 'WALLET'] as const)
      expect(commitmentIsCash(m)).toBe(true);
  });
});
