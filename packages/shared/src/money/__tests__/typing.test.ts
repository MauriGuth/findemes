import { describe, expect, it } from 'vitest';

import { amountToTypedDisplay, formatTypedAmount } from '../typing.js';

describe('formatTypedAmount', () => {
  it.each([
    ['', '', ''],
    ['3', '3', '3'],
    ['3000', '3.000', '3000'],
    ['3000000', '3.000.000', '3000000'],
    // Re-typing over our own dots keeps the grouping right.
    ['3.0000', '30.000', '30000'],
    ['1.234,5', '1.234,5', '1234.5'],
    ['1.234,56', '1.234,56', '1234.56'],
    ['1.234,567', '1.234,56', '1234.56'],
    ['1234,', '1.234,', '1234'],
    // A dot typed at the end is the decimal comma.
    ['1.234.', '1.234,', '1234'],
    [',5', '0,5', '0.5'],
    ['007', '7', '7'],
    ['$ 12a3', '123', '123'],
    ['1,2,3', '1,23', '1.23'],
    ['12345678901234567', '1.234.567.890.123', '1234567890123'],
  ])('%j → %j (%j)', (typed, display, amount) => {
    expect(formatTypedAmount(typed)).toEqual({ display, amount });
  });

  it('deleting the digit after a dot regroups instead of getting stuck', () => {
    // "3.000" with the last 0 deleted by backspace.
    expect(formatTypedAmount('3.00').display).toBe('300');
  });
});

describe('amountToTypedDisplay', () => {
  it.each([
    ['', ''],
    ['3000000.00', '3.000.000'],
    ['3000000', '3.000.000'],
    ['1234.50', '1.234,50'],
    ['1234.5', '1.234,50'],
    ['0.99', '0,99'],
  ])('%j → %j', (amount, display) => {
    expect(amountToTypedDisplay(amount)).toBe(display);
  });

  it('round-trips through formatTypedAmount', () => {
    expect(formatTypedAmount(amountToTypedDisplay('1234.56')).amount).toBe('1234.56');
  });
});
