import { describe, expect, it } from 'vitest';

import { computeMonthSummary } from '../compute-month-summary.js';
import { buildReminderSchedule } from '../reminder.js';

const TODAY = { year: 2026, month: 9, day: 21 };
const summary = computeMonthSummary({
  month: '2026-09',
  today: TODAY,
  plan: { expectedIncome: '1500000.00', salary: null },
  previousPlan: null,
  previousStatement: '0.00',
  commitments: [
    {
      id: 'c-1',
      name: 'Alquiler',
      kind: 'RENT',
      amount: '450000.00',
      currency: 'ARS',
      method: 'DEBIT',
      dayOfMonth: 10,
      startsOn: '2026-01-01',
      endsOn: null,
      installmentsTotal: null,
      active: true,
    },
  ],
  transactions: [
    {
      id: 't-1',
      amount: '25000.00',
      currency: 'ARS',
      direction: 'OUT',
      method: 'DEBIT',
      status: 'CONFIRMED',
      occurredAt: '2026-09-21T15:00:00Z',
      isOwnTransfer: false,
      commitmentId: null,
      commitmentMonth: null,
      isStatementPayment: false,
      isSalary: false,
    },
    {
      id: 't-2',
      amount: '8000.00',
      currency: 'ARS',
      direction: 'OUT',
      method: 'WALLET',
      status: 'CONFIRMED',
      occurredAt: '2026-09-20T15:00:00Z',
      isOwnTransfer: false,
      commitmentId: null,
      commitmentMonth: null,
      isStatementPayment: false,
      isSalary: false,
    },
  ],
});

describe('buildReminderSchedule', () => {
  it('schedules one entry per day at the chosen ART time with the per-day budget recomputed', () => {
    const entries = buildReminderSchedule(
      summary,
      TODAY,
      '20:00',
      new Date('2026-09-21T12:00:00Z'),
    );
    expect(entries).toHaveLength(8);
    expect(entries[0]?.at.toISOString()).toBe('2026-09-21T23:00:00.000Z');
    expect(entries[0]?.body).toBe(
      'Hoy: $25.000. Te quedan $1.017.000 para 10 días ($101.700 por día).',
    );
    expect(entries[1]?.body).toBe(
      'Te quedan $1.017.000 para 9 días ($113.000 por día). ¿Cargaste lo de hoy?',
    );
    expect(entries[6]?.body).toContain('para 4 días ($254.250 por día)');
    expect(entries[7]?.at.toISOString()).toBe('2026-09-28T23:00:00.000Z');
  });

  it('skips today when the time already passed', () => {
    const entries = buildReminderSchedule(
      summary,
      TODAY,
      '20:00',
      new Date('2026-09-21T23:30:00Z'),
    );
    expect(entries[0]?.at.toISOString()).toBe('2026-09-22T23:00:00.000Z');
    expect(entries[0]?.body).toContain('¿Cargaste lo de hoy?');
  });

  it('stops at the end of the month with a new-month nudge', () => {
    const today = { year: 2026, month: 9, day: 28 };
    const late = computeMonthSummary({
      month: '2026-09',
      today,
      plan: { expectedIncome: '300000.00', salary: null },
      previousPlan: null,
      previousStatement: '0.00',
      commitments: [],
      transactions: [],
    });
    const entries = buildReminderSchedule(late, today, '20:00', new Date('2026-09-28T12:00:00Z'));
    expect(entries.map((e) => e.at.toISOString())).toEqual([
      '2026-09-28T23:00:00.000Z',
      '2026-09-29T23:00:00.000Z',
      '2026-09-30T23:00:00.000Z',
      '2026-10-01T23:00:00.000Z',
    ]);
    expect(entries[2]?.body).toContain('para 1 días ($300.000 por día)');
    expect(entries[3]?.body).toBe('Empezó un mes nuevo. ¿Cuánto esperás cobrar?');
  });

  it('tells the truth when the money is gone', () => {
    const entries = buildReminderSchedule(
      { ...summary, remaining: '-50000.00' },
      TODAY,
      '21:15',
      new Date('2026-09-21T12:00:00Z'),
    );
    expect(entries[0]?.at.toISOString()).toBe('2026-09-22T00:15:00.000Z');
    expect(entries[0]?.body).toBe('Te pasaste por $50.000. Faltan 10 días para el 1.');
  });

  it('rejects malformed times', () => {
    expect(() => buildReminderSchedule(summary, TODAY, '24:00', new Date())).toThrow(RangeError);
  });
});
