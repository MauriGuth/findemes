import { describe, expect, it } from 'vitest';

import { detectRecurring, type RecurringInput } from '../recurring.js';

let seq = 0;
const tx = (partial: Partial<RecurringInput> & { occurredAt: string }): RecurringInput => {
  seq += 1;
  return {
    id: `t${String(seq)}`,
    amount: '9000.00',
    currency: 'ARS',
    direction: 'OUT',
    method: 'CREDIT',
    status: 'CONFIRMED',
    isOwnTransfer: false,
    commitmentId: null,
    merchantRaw: 'Streaming SA',
    merchantNorm: 'STREAMING',
    ...partial,
  };
};

const opts = { current: '2026-10' as const, knownNames: [], dismissed: [] };

describe('detectRecurring', () => {
  it('suggests a payment seen in 3 of the last 4 months around the same day and amount', () => {
    const [s, ...rest] = detectRecurring(
      [
        tx({ occurredAt: '2026-07-05T15:00:00Z', amount: '8000.00' }),
        tx({ occurredAt: '2026-08-06T15:00:00Z', amount: '8500.00' }),
        tx({ occurredAt: '2026-09-04T15:00:00Z', method: 'DEBIT' }),
        tx({ occurredAt: '2026-10-05T15:00:00Z' }),
        // Another merchant, only twice.
        tx({ occurredAt: '2026-09-10T15:00:00Z', merchantNorm: 'GYM', merchantRaw: 'Gym' }),
        tx({ occurredAt: '2026-10-10T15:00:00Z', merchantNorm: 'GYM', merchantRaw: 'Gym' }),
      ],
      opts,
    );
    expect(rest).toEqual([]);
    expect(s).toMatchObject({
      key: 'STREAMING',
      name: 'Streaming SA',
      amount: '9000.00',
      dayOfMonth: 5,
      method: 'CREDIT',
      months: 4,
    });
  });

  it('ignores very different amounts or days, known commitments and dismissed ones', () => {
    const scattered = [
      tx({ occurredAt: '2026-08-05T15:00:00Z' }),
      tx({ occurredAt: '2026-09-25T15:00:00Z' }),
      tx({ occurredAt: '2026-10-05T15:00:00Z', amount: '30000.00' }),
    ];
    expect(detectRecurring(scattered, opts)).toEqual([]);
    const steady = [
      tx({ occurredAt: '2026-08-05T15:00:00Z' }),
      tx({ occurredAt: '2026-09-05T15:00:00Z' }),
      tx({ occurredAt: '2026-10-05T15:00:00Z' }),
    ];
    expect(detectRecurring(steady, opts)).toHaveLength(1);
    expect(detectRecurring(steady, { ...opts, knownNames: ['STREAMING'] })).toEqual([]);
    expect(detectRecurring(steady, { ...opts, dismissed: ['STREAMING'] })).toEqual([]);
    expect(
      detectRecurring(
        steady.map((t) => ({ ...t, commitmentId: 'c' })),
        opts,
      ),
    ).toEqual([]);
  });

  it('a payment around the turn of the month is still monthly', () => {
    const [s] = detectRecurring(
      [
        tx({
          occurredAt: '2026-07-30T15:00:00Z',
          merchantNorm: 'ALQUILER',
          merchantRaw: 'Alquiler',
        }),
        tx({
          occurredAt: '2026-09-01T15:00:00Z',
          merchantNorm: 'ALQUILER',
          merchantRaw: 'Alquiler',
        }),
        tx({
          occurredAt: '2026-09-30T15:00:00Z',
          merchantNorm: 'ALQUILER',
          merchantRaw: 'Alquiler',
        }),
        tx({
          occurredAt: '2026-10-02T15:00:00Z',
          merchantNorm: 'ALQUILER',
          merchantRaw: 'Alquiler',
        }),
      ],
      opts,
    );
    expect(s).toMatchObject({ key: 'ALQUILER', months: 3 });
  });

  it('only looks at the last 4 months', () => {
    const old = [
      tx({ occurredAt: '2026-04-05T15:00:00Z' }),
      tx({ occurredAt: '2026-05-05T15:00:00Z' }),
      tx({ occurredAt: '2026-06-05T15:00:00Z' }),
    ];
    expect(detectRecurring(old, opts)).toEqual([]);
  });
});
