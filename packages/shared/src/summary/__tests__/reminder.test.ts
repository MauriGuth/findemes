import { describe, expect, it } from 'vitest';

import { computeMonthSummary } from '../compute-month-summary.js';
import { buildBillReminders, buildReminderSchedule } from '../reminder.js';

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
      origin: 'MANUAL',
      sourceId: null,
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
      origin: 'MANUAL',
      sourceId: null,
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

describe('buildBillReminders', () => {
  const bills = [
    { id: 'b1', issuer: 'Luz', amount: '62000.00', dueOn: '2026-09-23', status: 'UNPAID' as const },
    {
      id: 'b2',
      issuer: 'Colegio',
      amount: '150000.00',
      dueOn: '2026-09-22',
      status: 'PENDING' as const,
    },
    { id: 'b3', issuer: 'Gas', amount: '9000.00', dueOn: '2026-09-23', status: 'PAID' as const },
    { id: 'b4', issuer: 'Lejos', amount: '1.00', dueOn: '2026-12-01', status: 'UNPAID' as const },
  ];

  it('reminds the day before and the morning of each unpaid due date, at 10:00 ART', () => {
    const entries = buildBillReminders(bills, TODAY, new Date('2026-09-21T12:00:00Z'));
    expect(entries.map((e) => [e.at.toISOString(), e.title])).toEqual([
      ['2026-09-21T13:00:00.000Z', 'Mañana vence Colegio'],
      ['2026-09-22T13:00:00.000Z', 'Mañana vence Luz'],
      ['2026-09-22T13:00:00.000Z', 'Hoy vence Colegio'],
      ['2026-09-23T13:00:00.000Z', 'Hoy vence Luz'],
    ]);
    expect(entries[1]?.body).toBe('$62.000. Si ya lo pagaste, marcalo en Tu mes.');
    // Later the same morning, the reminders already past are skipped.
    const later = buildBillReminders(bills, TODAY, new Date('2026-09-21T14:00:00Z'));
    expect(later).toHaveLength(3);
  });

  it('writes dollar bills in dollars', () => {
    const [entry] = buildBillReminders(
      [
        {
          id: 'u',
          issuer: 'Nube',
          amount: '20.00',
          dueOn: '2026-09-23',
          status: 'UNPAID',
          currency: 'USD',
        },
      ],
      TODAY,
      new Date('2026-09-21T12:00:00Z'),
    );
    expect(entry?.body).toBe('US$20. Si ya lo pagaste, marcalo en Tu mes.');
  });
});
