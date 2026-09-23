import { describe, expect, it } from 'vitest';

import { computeMonthSummary } from '../compute-month-summary.js';
import {
  type MonthSummaryInput,
  type SummaryCommitmentInput,
  type SummaryTransactionInput,
} from '../types.js';

const M = '2026-09';
const TODAY = { year: 2026, month: 9, day: 21 };

let seq = 0;
function tx(
  partial: Partial<SummaryTransactionInput> & { amount: string },
): SummaryTransactionInput {
  seq += 1;
  return {
    id: `tx-${String(seq)}`,
    currency: 'ARS',
    direction: 'OUT',
    method: 'DEBIT',
    status: 'CONFIRMED',
    occurredAt: '2026-09-10T15:00:00Z',
    isOwnTransfer: false,
    commitmentId: null,
    commitmentMonth: null,
    isStatementPayment: false,
    isSalary: false,
    origin: 'MANUAL',
    sourceId: null,
    ...partial,
  };
}

function commitment(
  partial: Partial<SummaryCommitmentInput> & { amount: string },
): SummaryCommitmentInput {
  return {
    id: 'c-1',
    name: 'Alquiler',
    kind: 'RENT',
    currency: 'ARS',
    method: 'DEBIT',
    dayOfMonth: 10,
    startsOn: '2026-01-01',
    endsOn: null,
    installmentsTotal: null,
    active: true,
    ...partial,
  };
}

function input(partial: Partial<MonthSummaryInput> = {}): MonthSummaryInput {
  return {
    month: M,
    today: TODAY,
    plan: { expectedIncome: '1500000.00', salary: null },
    previousPlan: null,
    previousStatement: '0.00',
    commitments: [],
    transactions: [],
    ...partial,
  };
}

const alquiler = commitment({ amount: '450000.00' });
const heladera = commitment({
  id: 'c-2',
  name: 'Heladera',
  kind: 'INSTALLMENT',
  amount: '100000.00',
  dayOfMonth: 15,
  startsOn: '2026-06-01',
  endsOn: '2026-11-01',
  installmentsTotal: 6,
});
const netflix = commitment({
  id: 'c-3',
  name: 'Netflix',
  kind: 'SUBSCRIPTION',
  amount: '9000.00',
  dayOfMonth: 20,
  method: 'CREDIT',
});

describe('T1 — salary not received yet', () => {
  const base = input({
    commitments: [alquiler],
    transactions: [
      tx({ amount: '25000.00', occurredAt: '2026-09-05T15:00:00Z' }),
      tx({ amount: '8000.00', method: 'WALLET', occurredAt: '2026-09-20T15:00:00Z' }),
    ],
  });

  it('uses the expected income and subtracts cash spent and unpaid commitments', () => {
    const s = computeMonthSummary(base);
    expect(s.daysLeft).toBe(10);
    expect(s.income).toEqual({
      total: '1500000.00',
      source: 'expected',
      salary: null,
      expected: '1500000.00',
      other: '0.00',
    });
    expect(s.spent.cash).toBe('33000.00');
    expect(s.commitments.unpaidCash).toBe('450000.00');
    expect(s.remaining).toBe('1017000.00');
    expect(s.perDay).toBe('101700.00');
    expect(s.statement.next).toBe('0.00');
    expect(s.pending.unpaidDueCommitmentIds).toEqual(['c-1']);
  });

  it('T1b: a pending income does not count but becomes a salary candidate', () => {
    const pending = tx({
      amount: '200000.00',
      direction: 'IN',
      status: 'PENDING',
      occurredAt: '2026-09-04T15:00:00Z',
    });
    const s = computeMonthSummary({ ...base, transactions: [...base.transactions, pending] });
    expect(s.remaining).toBe('1017000.00');
    expect(s.pending.needsSalaryConfirmation).toBe(true);
    expect(s.pending.salaryCandidateIds).toEqual([pending.id]);
  });

  it('T1c: the confirmed salary replaces the expected income', () => {
    const salary = tx({
      amount: '1480000.00',
      direction: 'IN',
      occurredAt: '2026-09-04T15:00:00Z',
      isSalary: true,
    });
    const s = computeMonthSummary({
      ...base,
      plan: {
        expectedIncome: '1500000.00',
        salary: { transactionId: salary.id, amount: '1480000.00' },
      },
      transactions: [...base.transactions, salary],
    });
    expect(s.income.total).toBe('1480000.00');
    expect(s.income.source).toBe('confirmed');
    expect(s.income.other).toBe('0.00');
    expect(s.remaining).toBe('997000.00');
    expect(s.perDay).toBe('99700.00');
    expect(s.pending.needsSalaryConfirmation).toBe(false);
  });
});

describe('T2 — installments', () => {
  it('one installment per month, derived from the calendar', () => {
    const s = computeMonthSummary(input({ commitments: [heladera] }));
    expect(s.commitments.unpaidCash).toBe('100000.00');
    expect(s.remaining).toBe('1400000.00');
    expect(s.perDay).toBe('140000.00');
    expect(s.commitments.items[0]).toMatchObject({
      id: 'c-2',
      dueOn: '2026-09-15',
      paid: false,
      installmentNumber: 4,
      installmentsLeft: 2,
    });
  });

  it('T2b: linking the payment does not move the number', () => {
    const pago = tx({
      amount: '100000.00',
      occurredAt: '2026-09-15T15:00:00Z',
      commitmentId: 'c-2',
      commitmentMonth: M,
    });
    const s = computeMonthSummary(input({ commitments: [heladera], transactions: [pago] }));
    expect(s.commitments.unpaidCash).toBe('0.00');
    expect(s.commitments.paidCash).toBe('100000.00');
    expect(s.spent.cash).toBe('100000.00');
    expect(s.remaining).toBe('1400000.00');
    expect(s.commitments.items[0]).toMatchObject({ paid: true, transactionIds: [pago.id] });
  });

  it('T2c: after endsOn it no longer applies, but a payment still shows as paid', () => {
    const none = computeMonthSummary(input({ month: '2026-12', commitments: [heladera] }));
    expect(none.commitments.unpaidCash).toBe('0.00');
    expect(none.commitments.items).toEqual([]);
    const pago = tx({
      amount: '100000.00',
      occurredAt: '2026-12-15T15:00:00Z',
      commitmentId: 'c-2',
      commitmentMonth: '2026-12',
    });
    const paid = computeMonthSummary(
      input({ month: '2026-12', commitments: [heladera], transactions: [pago] }),
    );
    expect(paid.commitments.items[0]).toMatchObject({
      paid: true,
      unpaidAmount: '0.00',
      installmentNumber: null,
    });
  });

  it('T2d: a commitment starting next month does not count this month', () => {
    const s = computeMonthSummary(
      input({ commitments: [{ ...heladera, startsOn: '2026-10-01', endsOn: '2027-03-01' }] }),
    );
    expect(s.remaining).toBe('1500000.00');
    expect(s.commitments.items).toEqual([]);
  });

  it('T2e: day 31 falls on the last day of a short month', () => {
    const s = computeMonthSummary(input({ commitments: [{ ...alquiler, dayOfMonth: 31 }] }));
    expect(s.commitments.items[0]?.dueOn).toBe('2026-09-30');
    expect(s.pending.unpaidDueCommitmentIds).toEqual([]);
  });

  it('T2f: a partial payment keeps the invariant', () => {
    const pago = tx({
      amount: '60000.00',
      occurredAt: '2026-09-15T15:00:00Z',
      commitmentId: 'c-2',
      commitmentMonth: M,
    });
    const s = computeMonthSummary(input({ commitments: [heladera], transactions: [pago] }));
    expect(s.commitments.unpaidCash).toBe('40000.00');
    expect(s.commitments.paidCash).toBe('60000.00');
    expect(s.spent.cash).toBe('60000.00');
    expect(s.remaining).toBe('1400000.00');
    expect(s.commitments.items[0]).toMatchObject({
      paid: false,
      paidAmount: '60000.00',
      unpaidAmount: '40000.00',
    });
  });

  it('T2g: a late payment settles the month it belongs to, and the cash leaves when it leaves', () => {
    const tardio = tx({
      amount: '450000.00',
      occurredAt: '2026-10-02T15:00:00Z',
      commitmentId: 'c-1',
      commitmentMonth: '2026-09',
    });
    const sep = computeMonthSummary(input({ commitments: [alquiler], transactions: [tardio] }));
    expect(sep.commitments.items[0]?.paid).toBe(true);
    expect(sep.spent.cash).toBe('0.00');
    expect(sep.remaining).toBe('1500000.00');

    const oct = computeMonthSummary(
      input({
        month: '2026-10',
        today: { year: 2026, month: 10, day: 5 },
        commitments: [alquiler],
        transactions: [tardio],
      }),
    );
    expect(oct.spent.cash).toBe('450000.00');
    expect(oct.commitments.unpaidCash).toBe('450000.00');
    expect(oct.commitments.items[0]?.paid).toBe(false);
    expect(oct.remaining).toBe('600000.00');
  });
});

describe('T3 — credit vs debit', () => {
  const base = input({
    commitments: [netflix],
    transactions: [
      tx({ amount: '120000.00', method: 'CREDIT', occurredAt: '2026-09-12T15:00:00Z' }),
      tx({ amount: '30000.00', occurredAt: '2026-09-18T15:00:00Z' }),
    ],
  });

  it('credit goes to the next statement, not to the cash', () => {
    const s = computeMonthSummary(base);
    expect(s.spent.cash).toBe('30000.00');
    expect(s.spent.credit).toBe('120000.00');
    expect(s.commitments.unpaidCash).toBe('0.00');
    expect(s.commitments.unpaidCredit).toBe('9000.00');
    expect(s.remaining).toBe('1470000.00');
    expect(s.perDay).toBe('147000.00');
    expect(s.statement.next).toBe('129000.00');
    expect(s.pending.unpaidDueCommitmentIds).toEqual(['c-3']);
  });

  it('T3b: paying a credit commitment keeps the statement total', () => {
    const pago = tx({
      amount: '9000.00',
      method: 'CREDIT',
      occurredAt: '2026-09-20T15:00:00Z',
      commitmentId: 'c-3',
      commitmentMonth: M,
    });
    const s = computeMonthSummary({ ...base, transactions: [...base.transactions, pago] });
    expect(s.commitments.unpaidCredit).toBe('0.00');
    expect(s.commitments.paidCredit).toBe('9000.00');
    expect(s.spent.credit).toBe('129000.00');
    expect(s.statement.next).toBe('129000.00');
    expect(s.remaining).toBe('1470000.00');
  });

  it('T3c: the previous statement leaves the cash next month until it is paid', () => {
    const oct = input({
      month: '2026-10',
      today: { year: 2026, month: 10, day: 5 },
      previousStatement: '129000.00',
    });
    const unpaid = computeMonthSummary(oct);
    expect(unpaid.statement.previous).toEqual({
      amount: '129000.00',
      paid: false,
      paidAmount: '0.00',
    });
    expect(unpaid.remaining).toBe('1371000.00');
    expect(unpaid.pending.needsStatementPayment).toBe(true);

    const pago = tx({
      amount: '129000.00',
      occurredAt: '2026-10-04T15:00:00Z',
      isStatementPayment: true,
    });
    const paid = computeMonthSummary({ ...oct, transactions: [pago] });
    expect(paid.statement.previous).toEqual({
      amount: '129000.00',
      paid: true,
      paidAmount: '129000.00',
    });
    expect(paid.spent.cash).toBe('129000.00');
    expect(paid.remaining).toBe('1371000.00');
    expect(paid.pending.needsStatementPayment).toBe(false);
  });
});

describe('T4 — transfers between own accounts', () => {
  it('are neither income nor expense', () => {
    const s = computeMonthSummary(
      input({
        transactions: [
          tx({ amount: '200000.00', method: 'TRANSFER', isOwnTransfer: true }),
          tx({ amount: '200000.00', method: 'TRANSFER', direction: 'IN', isOwnTransfer: true }),
          tx({ amount: '15000.00' }),
        ],
      }),
    );
    expect(s.spent.cash).toBe('15000.00');
    expect(s.income.other).toBe('0.00');
    expect(s.remaining).toBe('1485000.00');
    expect(s.perDay).toBe('148500.00');
    expect(s.pending.salaryCandidateIds).toEqual([]);
  });
});

describe('edge cases', () => {
  it('E1: ignored movements do not count', () => {
    const s = computeMonthSummary(
      input({ transactions: [tx({ amount: '99999.00', status: 'IGNORED' })] }),
    );
    expect(s.remaining).toBe('1500000.00');
  });

  it('E2: USD is listed apart and never converted', () => {
    const s = computeMonthSummary(
      input({ transactions: [tx({ amount: '100.00', method: 'CASH', currency: 'USD' })] }),
    );
    expect(s.usd).toEqual({ spent: '100.00', income: '0.00' });
    expect(s.spent.cash).toBe('0.00');
  });

  it('E3: no plan at all', () => {
    const s = computeMonthSummary(input({ plan: null }));
    expect(s.income).toMatchObject({ total: '0.00', source: 'none' });
    expect(s.remaining).toBe('0.00');
    expect(s.perDay).toBeNull();
    expect(s.pending.needsPlan).toBe(true);
  });

  it('E3b: the previous plan is carried over until confirmed', () => {
    const s = computeMonthSummary(
      input({
        plan: null,
        previousPlan: { expectedIncome: '1500000.00', salaryAmount: null },
        commitments: [alquiler],
      }),
    );
    expect(s.income.source).toBe('carried');
    expect(s.remaining).toBe('1050000.00');
    expect(s.pending.needsPlan).toBe(true);
    const withSalary = computeMonthSummary(
      input({
        plan: null,
        previousPlan: { expectedIncome: '1500000.00', salaryAmount: '1480000.00' },
      }),
    );
    expect(withSalary.income.total).toBe('1480000.00');
  });

  it('E4: on the last day of the month the whole remaining is for today', () => {
    const s = computeMonthSummary(input({ today: { year: 2026, month: 9, day: 30 } }));
    expect(s.daysLeft).toBe(1);
    expect(s.perDay).toBe(s.remaining);
  });

  it('E5: overspending yields a negative remaining and no per-day budget', () => {
    const s = computeMonthSummary(
      input({
        plan: { expectedIncome: '100000.00', salary: null },
        transactions: [tx({ amount: '150000.00' })],
      }),
    );
    expect(s.remaining).toBe('-50000.00');
    expect(s.perDay).toBeNull();
  });

  it('E6: spent.today counts cash movements of the ART day only', () => {
    const s = computeMonthSummary(
      input({
        transactions: [
          tx({ amount: '1.00', occurredAt: '2026-09-21T11:00:00Z' }), // 21/9 08:00 ART
          tx({ amount: '2.00', occurredAt: '2026-09-22T02:59:00Z' }), // 21/9 23:59 ART
          tx({ amount: '4.00', occurredAt: '2026-09-21T02:59:00Z' }), // 20/9 23:59 ART
          tx({ amount: '8.00', method: 'CREDIT', occurredAt: '2026-09-21T15:00:00Z' }),
        ],
      }),
    );
    expect(s.spent.today).toBe('3.00');
  });

  it('E7: next month salary credited on the 30th is neither other income nor a candidate', () => {
    const s = computeMonthSummary(
      input({
        transactions: [
          tx({
            amount: '1480000.00',
            direction: 'IN',
            occurredAt: '2026-09-30T20:00:00Z',
            isSalary: true,
          }),
        ],
      }),
    );
    expect(s.income.other).toBe('0.00');
    expect(s.pending.needsSalaryConfirmation).toBe(false);
    expect(s.pending.salaryCandidateIds).toEqual([]);
  });

  it('E8: a confirmed unlinked income is "other income", not a salary candidate', () => {
    const s = computeMonthSummary(
      input({ transactions: [tx({ amount: '50000.00', direction: 'IN' })] }),
    );
    expect(s.income.other).toBe('50000.00');
    expect(s.pending.needsSalaryConfirmation).toBe(false);
  });

  it('E8b: a pending income is a candidate and does not count', () => {
    const t = tx({ amount: '50000.00', direction: 'IN', status: 'PENDING' });
    const s = computeMonthSummary(input({ transactions: [t] }));
    expect(s.income.other).toBe('0.00');
    expect(s.pending.needsSalaryConfirmation).toBe(true);
    expect(s.pending.salaryCandidateIds).toEqual([t.id]);
  });

  it('E9: a pending expense counts (conservative)', () => {
    const s = computeMonthSummary(
      input({ transactions: [tx({ amount: '5000.00', status: 'PENDING' })] }),
    );
    expect(s.spent.cash).toBe('5000.00');
    expect(s.remaining).toBe('1495000.00');
  });

  it('E11: a past month has no days left', () => {
    const s = computeMonthSummary(input({ month: '2026-08' }));
    expect(s.daysLeft).toBe(0);
    expect(s.perDay).toBeNull();
  });
});
