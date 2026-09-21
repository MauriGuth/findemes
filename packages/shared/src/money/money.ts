import Big from 'big.js';

/**
 * Amounts travel as decimal strings with up to two decimals ("1234.56", "-0.50").
 * Never as floats: JS numbers cannot represent 0.1 + 0.2 exactly, and money is
 * stored as Decimal(18, 2) in the database and as strings in the API.
 */
export type MoneyAmount = string;

export const MONEY_AMOUNT_REGEX = /^-?\d+(\.\d{1,2})?$/;

export class MoneyError extends Error {
  override readonly name = 'MoneyError';
}

const SCALE = 2;

/** Banker's rounding: avoids the systematic bias of round-half-up. */
const ROUNDING = Big.roundHalfEven;

// An isolated Big constructor so we never mutate the global big.js settings.
const B = Big();
B.DP = 20; // precision for intermediate divisions; results are rounded to SCALE afterwards
B.RM = ROUNDING;
B.NE = -30;
B.PE = 30; // never switch to exponential notation

export function isMoneyAmount(value: unknown): value is MoneyAmount {
  return typeof value === 'string' && MONEY_AMOUNT_REGEX.test(value);
}

function toBig(value: MoneyAmount | number): Big {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new MoneyError(`Invalid amount: ${String(value)}`);
    return new B(value);
  }
  if (!isMoneyAmount(value)) throw new MoneyError(`Invalid amount: ${JSON.stringify(value)}`);
  return new B(value);
}

function scaled(value: Big): MoneyAmount {
  const fixed = value.round(SCALE, ROUNDING).toFixed(SCALE);
  // Normalize "-0.00" to "0.00".
  return fixed === '-0.00' ? '0.00' : fixed;
}

/** Normalizes any accepted input ("12", "12.5", 12.5) to the canonical "12.50" form. */
export function normalizeMoney(value: MoneyAmount | number): MoneyAmount {
  return scaled(toBig(value));
}

export function addMoney(a: MoneyAmount, b: MoneyAmount): MoneyAmount {
  return scaled(toBig(a).plus(toBig(b)));
}

export function subtractMoney(a: MoneyAmount, b: MoneyAmount): MoneyAmount {
  return scaled(toBig(a).minus(toBig(b)));
}

/** Multiplies an amount by a plain factor (quantity, rate). Result rounded half-even to cents. */
export function multiplyMoney(amount: MoneyAmount, factor: number | string): MoneyAmount {
  return scaled(toBig(amount).times(new B(factor)));
}

/** Divides an amount by a plain divisor (days, installments). Result rounded half-even to cents. */
export function divideMoney(amount: MoneyAmount, divisor: number | string): MoneyAmount {
  const d = new B(divisor);
  if (d.eq(0)) throw new MoneyError('Division by zero');
  return scaled(toBig(amount).div(d));
}

export function sumMoney(amounts: readonly MoneyAmount[]): MoneyAmount {
  return scaled(amounts.reduce((acc, value) => acc.plus(toBig(value)), new B(0)));
}

export function negateMoney(amount: MoneyAmount): MoneyAmount {
  return scaled(toBig(amount).neg());
}

export function absMoney(amount: MoneyAmount): MoneyAmount {
  return scaled(toBig(amount).abs());
}

export function compareMoney(a: MoneyAmount, b: MoneyAmount): -1 | 0 | 1 {
  return toBig(a).cmp(toBig(b));
}

export function isZeroMoney(amount: MoneyAmount): boolean {
  return toBig(amount).eq(0);
}

export function isNegativeMoney(amount: MoneyAmount): boolean {
  return toBig(amount).lt(0);
}

export function maxMoney(a: MoneyAmount, b: MoneyAmount): MoneyAmount {
  return compareMoney(a, b) >= 0 ? normalizeMoney(a) : normalizeMoney(b);
}

export function minMoney(a: MoneyAmount, b: MoneyAmount): MoneyAmount {
  return compareMoney(a, b) <= 0 ? normalizeMoney(a) : normalizeMoney(b);
}

/**
 * Splits an amount into `parts` installments without losing or inventing cents.
 * The remainder cents go to the first installments, so "3 cuotas de $10.000"
 * becomes ["3333.34", "3333.33", "3333.33"] and the sum is still exactly 10000.00.
 */
export function allocateMoney(total: MoneyAmount, parts: number): MoneyAmount[] {
  if (!Number.isInteger(parts) || parts < 1) {
    throw new MoneyError(`Cannot allocate into ${String(parts)} parts`);
  }
  const totalCents = toBig(total).times(100).round(0, ROUNDING);
  const sign = totalCents.lt(0) ? -1 : 1;
  const absCents = totalCents.abs();
  const base = absCents.div(parts).round(0, Big.roundDown);
  const remainder = absCents.minus(base.times(parts)).toNumber();

  return Array.from({ length: parts }, (_, index) => {
    const cents = index < remainder ? base.plus(1) : base;
    return scaled(cents.times(sign).div(100));
  });
}
