import { describe, expect, it } from 'vitest';

import { mondayOf, weeklyRetention } from './retention.js';

describe('weeklyRetention', () => {
  it('groups signups by week and counts who came back each following week', () => {
    expect(mondayOf('2026-10-14')).toBe('2026-10-12');
    expect(mondayOf('2026-10-12')).toBe('2026-10-12');
    const cohorts = weeklyRetention(
      [
        { id: 'a', signupDay: '2026-09-28' },
        { id: 'b', signupDay: '2026-10-01' },
        { id: 'c', signupDay: '2026-10-13' },
      ],
      [
        { userId: 'a', day: '2026-10-06' },
        { userId: 'b', day: '2026-10-07' },
        { userId: 'a', day: '2026-10-14' },
        { userId: 'c', day: '2026-10-14' },
      ],
      '2026-10-14',
    );
    expect(cohorts).toEqual([
      { week: '2026-09-28', users: 2, retained: [2, 1] },
      { week: '2026-10-12', users: 1, retained: [] },
    ]);
  });
});
