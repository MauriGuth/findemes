import { describe, expect, it } from 'vitest';

import {
  type AnalysisTransaction,
  budgetAlertLevel,
  computeBudgets,
  computeStats,
} from '../analysis.js';

const tx = (partial: Partial<AnalysisTransaction> & { amount: string }): AnalysisTransaction => ({
  currency: 'ARS',
  direction: 'OUT',
  status: 'CONFIRMED',
  isOwnTransfer: false,
  isStatementPayment: false,
  categoryId: 'super',
  occurredAt: '2026-10-10T15:00:00Z',
  ...partial,
});

describe('computeBudgets', () => {
  it('sums the category spending, pending and credit included, nothing else', () => {
    const [budget] = computeBudgets(
      [{ id: 'b', categoryId: 'super', amount: '100000.00' }],
      [
        tx({ amount: '50000.00' }),
        tx({ amount: '30000.00', status: 'PENDING' }),
        tx({ amount: '9999.00', status: 'IGNORED' }),
        tx({ amount: '9999.00', categoryId: 'otros' }),
        tx({ amount: '9999.00', direction: 'IN' }),
        tx({ amount: '9999.00', isOwnTransfer: true }),
        tx({ amount: '9999.00', currency: 'USD' }),
        tx({ amount: '9999.00', isStatementPayment: true }),
      ],
    );
    expect(budget).toMatchObject({ spent: '80000.00', remaining: '20000.00', ratio: 0.8 });
    expect(budgetAlertLevel({ ratio: 0.8 })).toBe(80);
    expect(budgetAlertLevel({ ratio: 1.2 })).toBe(100);
    expect(budgetAlertLevel({ ratio: 0.79 })).toBe(0);
  });
});

describe('computeStats', () => {
  it('daily average, categories, weekday and the previous period over the same days', () => {
    const stats = computeStats({
      month: '2026-10',
      previousMonth: '2026-09',
      payday: 5,
      // Period starts 5 Oct; today 14 Oct → 10 days elapsed.
      today: { year: 2026, month: 10, day: 14 },
      current: [
        tx({ amount: '60000.00', occurredAt: '2026-10-10T15:00:00Z' }), // Saturday
        tx({ amount: '30000.00', categoryId: 'comida', occurredAt: '2026-10-12T15:00:00Z' }),
        tx({ amount: '10000.00', categoryId: null, occurredAt: '2026-10-12T16:00:00Z' }),
      ],
      previous: [
        tx({ amount: '50000.00', occurredAt: '2026-09-06T15:00:00Z' }), // day 2 of the period
        tx({ amount: '99000.00', occurredAt: '2026-09-30T15:00:00Z' }), // day 26: not compared
      ],
    });
    expect(stats.spent).toBe('100000.00');
    expect(stats.dailyAverage).toBe('10000.00');
    expect(stats.byCategory.map((c) => [c.categoryId, c.amount, c.share])).toEqual([
      ['super', '60000.00', 0.6],
      ['comida', '30000.00', 0.3],
      [null, '10000.00', 0.1],
    ]);
    expect(stats.topWeekday).toEqual({ weekday: 6, amount: '60000.00' });
    expect(stats.previous).toEqual({ month: '2026-09', sameDays: '50000.00', change: 1 });
  });

  it('handles an empty period', () => {
    const stats = computeStats({
      month: '2026-10',
      previousMonth: '2026-09',
      payday: 1,
      today: { year: 2026, month: 10, day: 1 },
      current: [],
      previous: [],
    });
    expect(stats).toMatchObject({ spent: '0.00', dailyAverage: '0.00', topWeekday: null });
    expect(stats.previous.change).toBeNull();
  });
});
