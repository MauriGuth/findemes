import { describe, expect, it } from 'vitest';

import {
  absMoney,
  addMoney,
  allocateMoney,
  compareMoney,
  divideMoney,
  isMoneyAmount,
  isNegativeMoney,
  isZeroMoney,
  maxMoney,
  minMoney,
  MoneyError,
  multiplyMoney,
  negateMoney,
  normalizeMoney,
  subtractMoney,
  sumMoney,
} from '../money.js';

describe('normalizeMoney', () => {
  it('always renders two decimals', () => {
    expect(normalizeMoney('12')).toBe('12.00');
    expect(normalizeMoney('12.5')).toBe('12.50');
    expect(normalizeMoney('-0.5')).toBe('-0.50');
    expect(normalizeMoney(0)).toBe('0.00');
    expect(normalizeMoney(1234.5)).toBe('1234.50');
  });

  it('never produces negative zero', () => {
    expect(normalizeMoney('-0')).toBe('0.00');
    expect(subtractMoney('1.00', '1.00')).toBe('0.00');
  });

  it('rejects anything that is not a decimal string with up to two decimals', () => {
    for (const bad of ['', 'abc', '1,5', '1.234', '$1', '1e3', ' 1', '1.']) {
      expect(() => normalizeMoney(bad)).toThrow(MoneyError);
    }
    expect(() => normalizeMoney(Number.NaN)).toThrow(MoneyError);
    expect(isMoneyAmount('1.23')).toBe(true);
    expect(isMoneyAmount('1.234')).toBe(false);
    expect(isMoneyAmount(1.23)).toBe(false);
  });
});

describe('arithmetic', () => {
  it('adds and subtracts without floating point drift', () => {
    expect(addMoney('0.10', '0.20')).toBe('0.30');
    expect(addMoney('999999999999.99', '0.01')).toBe('1000000000000.00');
    expect(subtractMoney('100.00', '0.01')).toBe('99.99');
    expect(subtractMoney('10.00', '25.50')).toBe('-15.50');
  });

  it('multiplies and rounds half-even to cents', () => {
    expect(multiplyMoney('10.00', 3)).toBe('30.00');
    expect(multiplyMoney('2.01', 0.5)).toBe('1.00'); // 1.005 → half-even → 1.00
    expect(multiplyMoney('2.03', 0.5)).toBe('1.02'); // 1.015 → half-even → 1.02
    expect(multiplyMoney('2.05', 0.5)).toBe('1.02'); // 1.025 → half-even → 1.02
    expect(multiplyMoney('19.99', '1.21')).toBe('24.19'); // 24.1879
  });

  it('divides and rounds half-even to cents', () => {
    expect(divideMoney('10.00', 3)).toBe('3.33');
    expect(divideMoney('100.00', 8)).toBe('12.50');
    expect(divideMoney('-10.00', 4)).toBe('-2.50');
    expect(() => divideMoney('10.00', 0)).toThrow(MoneyError);
  });

  it('sums a list', () => {
    expect(sumMoney([])).toBe('0.00');
    expect(sumMoney(['0.10', '0.20', '0.30'])).toBe('0.60');
    expect(sumMoney(['100.00', '-40.50'])).toBe('59.50');
  });

  it('negates, abs, compares', () => {
    expect(negateMoney('5.00')).toBe('-5.00');
    expect(negateMoney('0.00')).toBe('0.00');
    expect(absMoney('-5.00')).toBe('5.00');
    expect(compareMoney('1.00', '1.00')).toBe(0);
    expect(compareMoney('1.00', '1.01')).toBe(-1);
    expect(compareMoney('2', '1.99')).toBe(1);
    expect(isZeroMoney('0')).toBe(true);
    expect(isNegativeMoney('-0.01')).toBe(true);
    expect(maxMoney('1', '2')).toBe('2.00');
    expect(minMoney('1', '2')).toBe('1.00');
  });
});

describe('allocateMoney (cuotas)', () => {
  it('splits 10000 in 3 without losing cents', () => {
    const parts = allocateMoney('10000.00', 3);
    expect(parts).toEqual(['3333.34', '3333.33', '3333.33']);
    expect(sumMoney(parts)).toBe('10000.00');
  });

  it('splits exact amounts evenly', () => {
    expect(allocateMoney('90.00', 3)).toEqual(['30.00', '30.00', '30.00']);
    expect(allocateMoney('0.05', 5)).toEqual(['0.01', '0.01', '0.01', '0.01', '0.01']);
  });

  it('handles remainders larger than one cent and negatives', () => {
    expect(allocateMoney('1.00', 3)).toEqual(['0.34', '0.33', '0.33']);
    expect(allocateMoney('0.02', 3)).toEqual(['0.01', '0.01', '0.00']);
    expect(allocateMoney('-10.00', 3)).toEqual(['-3.34', '-3.33', '-3.33']);
    expect(sumMoney(allocateMoney('-10.00', 3))).toBe('-10.00');
  });

  it('rejects invalid part counts', () => {
    expect(() => allocateMoney('10', 0)).toThrow(MoneyError);
    expect(() => allocateMoney('10', 1.5)).toThrow(MoneyError);
  });
});
