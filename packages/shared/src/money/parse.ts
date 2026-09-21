import { type MoneyAmount, normalizeMoney } from './money.js';

const CURRENCY_TOKENS = /(?:US\$|U\$S|USD|ARS|\$)/gi;
const SPACES = /[\s  ]/g;

/**
 * Parses an amount typed or displayed the Argentine way back to the canonical
 * "1234.56" form. Accepts "$1.234,56", "$ 1.234,56", "-1.234,56", "1234,56",
 * "1.234", "1234", "12.50" (only when the dot cannot be a thousands separator).
 * Returns null when the input is not an amount; never throws.
 */
export function parseArs(input: string): MoneyAmount | null {
  if (typeof input !== 'string') return null;
  let text = input.replace(SPACES, '').replace(CURRENCY_TOKENS, '');
  if (text === '') return null;

  let negative = false;
  if (text.startsWith('-')) {
    negative = true;
    text = text.slice(1);
  } else if (text.startsWith('+')) {
    text = text.slice(1);
  }
  // Trailing minus as some bank apps print it: "1.234,56-"
  if (text.endsWith('-')) {
    negative = !negative;
    text = text.slice(0, -1);
  }

  if (!/^[\d.,]+$/.test(text)) return null;

  let canonical: string;
  if (text.includes(',')) {
    // "1.234,56" → dots are thousands, comma is the decimal separator.
    const [integerPart, decimalPart, ...rest] = text.split(',');
    if (rest.length > 0 || integerPart === undefined) return null;
    const digits = integerPart.replace(/\./g, '');
    if (!/^\d+$/.test(digits)) return null;
    if (decimalPart !== undefined && !/^\d{1,2}$/.test(decimalPart)) return null;
    canonical =
      decimalPart === undefined || decimalPart === '' ? digits : `${digits}.${decimalPart}`;
  } else if (text.includes('.')) {
    if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
      // "1.234" / "1.234.567" → thousands separators.
      canonical = text.replace(/\./g, '');
    } else if (/^\d+\.\d{1,2}$/.test(text)) {
      // "12.5" / "12.50" → cannot be thousands, treat the dot as decimal.
      canonical = text;
    } else {
      return null;
    }
  } else {
    if (!/^\d+$/.test(text)) return null;
    canonical = text;
  }

  return normalizeMoney(negative ? `-${canonical}` : canonical);
}
