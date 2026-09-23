import { describe, expect, it } from 'vitest';

import { computeMonthSummary } from '../compute-month-summary.js';
import { findReviewPairs } from '../review-pairs.js';
import { type SummaryTransactionInput } from '../types.js';

let seq = 0;
function tx(
  partial: Partial<SummaryTransactionInput> & { amount: string },
): SummaryTransactionInput {
  seq += 1;
  return {
    id: `t-${String(seq)}`,
    currency: 'ARS',
    direction: 'OUT',
    method: 'TRANSFER',
    status: 'CONFIRMED',
    occurredAt: '2026-09-10T15:00:00Z',
    isOwnTransfer: false,
    commitmentId: null,
    commitmentMonth: null,
    isStatementPayment: false,
    isSalary: false,
    origin: 'TEMPLATE',
    sourceId: 'bank-a',
    ...partial,
  };
}

const at = (minutes: number) => new Date(Date.UTC(2026, 8, 10, 15, minutes)).toISOString();

describe('findReviewPairs', () => {
  it('pairs an unclassified income with an outgoing transfer from another account', () => {
    const out = tx({ amount: '200000.00', occurredAt: at(0) });
    const incoming = tx({
      amount: '200000.00',
      direction: 'IN',
      status: 'PENDING',
      sourceId: 'wallet-b',
      occurredAt: at(12),
    });
    expect(findReviewPairs([out, incoming]).ownTransferPairs).toEqual([
      { outId: out.id, inId: incoming.id },
    ]);
  });

  it('does not pair the same source, another amount, a classified income or a gap over 30 min', () => {
    const out = tx({ amount: '1000.00', occurredAt: at(0) });
    const cases = [
      tx({ amount: '1000.00', direction: 'IN', status: 'PENDING', sourceId: 'bank-a' }),
      tx({ amount: '999.00', direction: 'IN', status: 'PENDING', sourceId: 'x' }),
      tx({ amount: '1000.00', direction: 'IN', status: 'CONFIRMED', sourceId: 'x' }),
      tx({
        amount: '1000.00',
        direction: 'IN',
        status: 'PENDING',
        sourceId: 'x',
        occurredAt: at(31),
      }),
    ];
    for (const incoming of cases) {
      expect(findReviewPairs([out, incoming]).ownTransferPairs).toEqual([]);
    }
  });

  it('pairs a pending detected movement with a manual one of the same payment', () => {
    const manual = tx({ amount: '777.00', origin: 'MANUAL', sourceId: null, occurredAt: at(0) });
    const auto = tx({ amount: '777.00', status: 'PENDING', occurredAt: at(8) });
    const lone = tx({ amount: '300.00', status: 'PENDING', occurredAt: at(20) });
    expect(findReviewPairs([manual, auto, lone])).toEqual({
      ownTransferPairs: [],
      possibleDuplicatePairs: [{ autoId: auto.id, manualId: manual.id }],
      reviewTransactionIds: [lone.id],
    });
  });

  it('ignores IGNORED movements and own transfers already marked', () => {
    const manual = tx({ amount: '5.00', origin: 'MANUAL', sourceId: null, status: 'IGNORED' });
    const auto = tx({ amount: '5.00', status: 'PENDING' });
    const own = tx({ amount: '9.00', status: 'PENDING', isOwnTransfer: true });
    expect(findReviewPairs([manual, auto, own])).toEqual({
      ownTransferPairs: [],
      possibleDuplicatePairs: [],
      reviewTransactionIds: [auto.id],
    });
  });
});

describe('computeMonthSummary with review pairs', () => {
  const base = {
    month: '2026-09',
    today: { year: 2026, month: 9, day: 21 },
    plan: { expectedIncome: '1500000.00', salary: null },
    previousPlan: null,
    previousStatement: '0.00',
    commitments: [],
  };

  it('a paired income is not a salary candidate, and answering never breaks the formula', () => {
    const out = tx({ amount: '200000.00', occurredAt: at(0) });
    const incoming = tx({
      amount: '200000.00',
      direction: 'IN',
      status: 'PENDING',
      sourceId: 'wallet-b',
      occurredAt: at(5),
    });
    const before = computeMonthSummary({ ...base, transactions: [out, incoming] });
    expect(before.pending.ownTransferPairs).toHaveLength(1);
    expect(before.pending.salaryCandidateIds).toEqual([]);
    // The OUT already lowers the number while the question is open (conservative).
    expect(before.remaining).toBe('1300000.00');

    // "Sí, fue entre mis cuentas": both become own transfers; nothing is spent.
    const yes = computeMonthSummary({
      ...base,
      transactions: [
        { ...out, isOwnTransfer: true },
        { ...incoming, isOwnTransfer: true },
      ],
    });
    expect(yes.remaining).toBe('1500000.00');
    expect(yes.pending.ownTransferPairs).toEqual([]);

    // "No": the income is confirmed as other income; the pair disappears.
    const no = computeMonthSummary({
      ...base,
      transactions: [out, { ...incoming, status: 'CONFIRMED' }],
    });
    expect(no.remaining).toBe('1500000.00');
    expect(no.pending.ownTransferPairs).toEqual([]);
  });

  it('confirming a detected pending expense does not move the number', () => {
    const auto = tx({ amount: '4500.00', method: 'DEBIT', status: 'PENDING' });
    const pending = computeMonthSummary({ ...base, transactions: [auto] });
    const confirmed = computeMonthSummary({
      ...base,
      transactions: [{ ...auto, status: 'CONFIRMED' }],
    });
    expect(pending.pending.reviewTransactionIds).toEqual([auto.id]);
    expect(confirmed.pending.reviewTransactionIds).toEqual([]);
    expect(pending.remaining).toBe(confirmed.remaining);
  });

  it('"Es el mismo" (manual ignored) leaves the payment counted once', () => {
    const manual = tx({ amount: '777.00', method: 'DEBIT', origin: 'MANUAL', sourceId: null });
    const auto = tx({ amount: '777.00', method: 'DEBIT', status: 'PENDING' });
    const both = computeMonthSummary({ ...base, transactions: [manual, auto] });
    expect(both.spent.cash).toBe('1554.00');
    const resolved = computeMonthSummary({
      ...base,
      transactions: [
        { ...manual, status: 'IGNORED' },
        { ...auto, status: 'CONFIRMED' },
      ],
    });
    expect(resolved.spent.cash).toBe('777.00');
    expect(resolved.pending.possibleDuplicatePairs).toEqual([]);
  });
});
