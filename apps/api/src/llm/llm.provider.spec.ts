import { describe, expect, it } from 'vitest';

import { costMicros } from './llm.provider.js';

describe('costMicros', () => {
  it('prices by model prefix, longest first', () => {
    // 1000 in × $5 + 200 out × $25 per million tokens = 5000 + 5000 micro-dollars.
    expect(costMicros('claude-opus-5', 1000, 200)).toBe(10_000);
    expect(costMicros('claude-opus-5-5', 1000, 200)).toBe(8_000);
    expect(costMicros('claude-haiku-4-5', 1000, 200)).toBe(2_000);
  });

  it('bills unknown models at the highest price', () => {
    expect(costMicros('some-new-model', 1000, 200)).toBe(20_000);
  });
});
