import { type MoneyAmount } from './money.js';

/** Enough for Decimal(18,2); longer input is ignored while typing. */
const MAX_INTEGER_DIGITS = 13;

export interface TypedAmount {
  /** What the field shows: "3.000.000", "1.234,5", "0,". Never ends in a dot. */
  display: string;
  /** Canonical amount ("3000000", "1234.5") or '' when nothing was typed. */
  amount: MoneyAmount | '';
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Formats a money field on every keystroke, es-AR style: dots group thousands,
 * the comma starts the cents (at most two). Dots the user types in the middle are
 * dropped (they are our own separators); a dot typed at the end becomes the comma,
 * since some keyboards only offer "." on the decimal pad.
 */
export function formatTypedAmount(text: string): TypedAmount {
  let cleaned = text.replace(/[^\d.,]/g, '');
  if (cleaned.endsWith('.') && !cleaned.includes(',')) cleaned = `${cleaned.slice(0, -1)},`;

  const commaAt = cleaned.indexOf(',');
  const hasComma = commaAt !== -1;
  const integerRaw = (hasComma ? cleaned.slice(0, commaAt) : cleaned).replace(/\D/g, '');
  const decimals = hasComma
    ? cleaned
        .slice(commaAt + 1)
        .replace(/\D/g, '')
        .slice(0, 2)
    : '';

  const integer = integerRaw.replace(/^0+(?=\d)/, '').slice(0, MAX_INTEGER_DIGITS);
  if (integer === '' && !hasComma) return { display: '', amount: '' };

  const shownInteger = groupThousands(integer === '' ? '0' : integer);
  const display = hasComma ? `${shownInteger},${decimals}` : shownInteger;
  const amount = `${integer === '' ? '0' : integer}${decimals ? `.${decimals}` : ''}`;
  return { display, amount };
}

/** The field text for an amount that comes from the server: "1234.50" → "1.234,50", "3000000.00" → "3.000.000". */
export function amountToTypedDisplay(amount: MoneyAmount | ''): string {
  if (amount === '') return '';
  const [integer = '0', decimals = ''] = amount.replace(/^-/, '').split('.');
  const cents = /^0*$/.test(decimals) ? '' : decimals.padEnd(2, '0');
  return formatTypedAmount(cents ? `${integer},${cents}` : integer).display;
}
