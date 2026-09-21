import { type MoneyAmount, normalizeMoney } from './money.js';

export type FormatCurrency = 'ARS' | 'USD';

export interface FormatMoneyOptions {
  /** Currency prefix. Defaults to ARS ("$"). USD renders as "US$". */
  currency?: FormatCurrency;
  /** Show the ",00" cents. Defaults to true. The dashboard header uses false. */
  cents?: boolean;
  /** Prefix positive amounts with "+". Defaults to false. */
  explicitPlus?: boolean;
}

const CURRENCY_PREFIX: Record<FormatCurrency, string> = {
  ARS: '$',
  USD: 'US$',
};

const THOUSANDS_SEPARATOR = '.';
const DECIMAL_SEPARATOR = ',';

function groupThousands(integerDigits: string): string {
  let out = '';
  for (let i = 0; i < integerDigits.length; i += 1) {
    const fromEnd = integerDigits.length - i;
    out += integerDigits[i];
    if (fromEnd > 1 && (fromEnd - 1) % 3 === 0) out += THOUSANDS_SEPARATOR;
  }
  return out;
}

/**
 * Formats an amount the way Argentines read it: "$1.234,56", "-$1.234,56", "US$10,00".
 *
 * Deliberately not built on Intl.NumberFormat: Hermes uses whatever ICU data the
 * device ships (output varies by OS version and iOS lacks formatToParts) and Node
 * with full ICU prints "$ 1.234,56" with a non-breaking space. Hand-formatting the
 * decimal string gives the same output everywhere and is trivially testable.
 */
export function formatMoney(
  amount: MoneyAmount | number,
  options: FormatMoneyOptions = {},
): string {
  const { currency = 'ARS', cents = true, explicitPlus = false } = options;
  const normalized = normalizeMoney(amount);
  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [integerPart = '0', decimalPart = '00'] = unsigned.split('.');

  let out = CURRENCY_PREFIX[currency] + groupThousands(integerPart);
  if (cents) out += DECIMAL_SEPARATOR + decimalPart;
  if (negative) return `-${out}`;
  if (explicitPlus) return `+${out}`;
  return out;
}

/** Shorthand for the default ARS formatting: formatArs("1234.5") → "$1.234,50". */
export function formatArs(
  amount: MoneyAmount | number,
  options: Omit<FormatMoneyOptions, 'currency'> = {},
): string {
  return formatMoney(amount, { ...options, currency: 'ARS' });
}
