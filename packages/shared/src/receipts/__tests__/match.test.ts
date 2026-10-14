import { describe, expect, it } from 'vitest';

import { pickReceiptMatch } from '../match.js';

const target = { total: '15230.50', currency: 'ARS' as const, at: '2026-10-10T15:00:00-03:00' };
const tx = (id: string, amount: string, occurredAt: string, currency: 'ARS' | 'USD' = 'ARS') => ({
  id,
  amount,
  currency,
  occurredAt,
});

describe('pickReceiptMatch', () => {
  it('matches the same total within 48 hours', () => {
    const match = pickReceiptMatch(target, [tx('a', '15230.50', '2026-10-10T15:05:00-03:00')]);
    expect(match?.id).toBe('a');
  });

  it('tolerates up to one peso of rounding', () => {
    expect(pickReceiptMatch(target, [tx('a', '15231.50', '2026-10-10T15:00:00-03:00')])?.id).toBe(
      'a',
    );
    expect(pickReceiptMatch(target, [tx('a', '15231.51', '2026-10-10T15:00:00-03:00')])).toBeNull();
  });

  it('ignores movements outside 48 hours or in another currency', () => {
    expect(pickReceiptMatch(target, [tx('a', '15230.50', '2026-10-12T15:00:01-03:00')])).toBeNull();
    expect(
      pickReceiptMatch(target, [tx('a', '15230.50', '2026-10-10T15:00:00-03:00', 'USD')]),
    ).toBeNull();
  });

  it('prefers the exact amount, then the closest time', () => {
    const match = pickReceiptMatch(target, [
      tx('near-but-off', '15231.00', '2026-10-10T15:00:00-03:00'),
      tx('exact-far', '15230.50', '2026-10-11T15:00:00-03:00'),
      tx('exact-near', '15230.50', '2026-10-10T16:00:00-03:00'),
    ]);
    expect(match?.id).toBe('exact-near');
  });
});
