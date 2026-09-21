import { describe, expect, it } from 'vitest';

import { formatArs, formatMoney } from '../format.js';
import { parseArs } from '../parse.js';

describe('formatArs', () => {
  it('formats the Argentine way', () => {
    expect(formatArs('0')).toBe('$0,00');
    expect(formatArs('5')).toBe('$5,00');
    expect(formatArs('999.99')).toBe('$999,99');
    expect(formatArs('1000')).toBe('$1.000,00');
    expect(formatArs('1234.56')).toBe('$1.234,56');
    expect(formatArs('12345.6')).toBe('$12.345,60');
    expect(formatArs('123456789.01')).toBe('$123.456.789,01');
    expect(formatArs('1000000')).toBe('$1.000.000,00');
  });

  it('puts the minus before the currency sign', () => {
    expect(formatArs('-1234.56')).toBe('-$1.234,56');
    expect(formatArs('-0.5')).toBe('-$0,50');
  });

  it('can hide cents for the dashboard header', () => {
    expect(formatArs('1234.56', { cents: false })).toBe('$1.234');
    expect(formatArs('-1234.56', { cents: false })).toBe('-$1.234');
  });

  it('can show an explicit plus', () => {
    expect(formatArs('10', { explicitPlus: true })).toBe('+$10,00');
    expect(formatArs('-10', { explicitPlus: true })).toBe('-$10,00');
    expect(formatArs('0', { explicitPlus: true })).toBe('+$0,00');
  });

  it('accepts numbers as a convenience', () => {
    expect(formatArs(1234.5)).toBe('$1.234,50');
  });

  it('formats USD with the US$ prefix', () => {
    expect(formatMoney('100', { currency: 'USD' })).toBe('US$100,00');
    expect(formatMoney('-1500.5', { currency: 'USD' })).toBe('-US$1.500,50');
  });
});

describe('parseArs', () => {
  it('parses what formatArs produces', () => {
    for (const amount of [
      '0.00',
      '5.00',
      '999.99',
      '1000.00',
      '1234.56',
      '123456789.01',
      '-1234.56',
    ]) {
      expect(parseArs(formatArs(amount))).toBe(amount);
      expect(parseArs(formatArs(amount, { cents: false }))).toBe(amount.replace(/\.\d\d$/, '.00'));
    }
  });

  it('parses the ways banks and people write amounts', () => {
    expect(parseArs('$ 1.234,56')).toBe('1234.56');
    expect(parseArs('$ 1.234,56')).toBe('1234.56');
    expect(parseArs('1234,56')).toBe('1234.56');
    expect(parseArs('1234,5')).toBe('1234.50');
    expect(parseArs('1.234')).toBe('1234.00');
    expect(parseArs('1.234.567')).toBe('1234567.00');
    expect(parseArs('1234')).toBe('1234.00');
    expect(parseArs('12.50')).toBe('12.50');
    expect(parseArs('12.5')).toBe('12.50');
    expect(parseArs('-1.234,56')).toBe('-1234.56');
    expect(parseArs('1.234,56-')).toBe('-1234.56');
    expect(parseArs('+500')).toBe('500.00');
    expect(parseArs('US$ 100')).toBe('100.00');
    expect(parseArs('ARS 100,10')).toBe('100.10');
  });

  it('returns null for things that are not amounts', () => {
    for (const bad of ['', '$', 'abc', '1,2,3', '1,234', '1.2345', '12.345.6', '1..2', '--1']) {
      expect(parseArs(bad)).toBeNull();
    }
  });
});
