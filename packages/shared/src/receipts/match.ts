import { absMoney, compareMoney, type MoneyAmount, subtractMoney } from '../money/money.js';
import { type Currency } from '../schemas/enums.js';

/** A ticket and its payment differ by rounding at most (CLAUDE.md: ± $1). */
export const RECEIPT_AMOUNT_TOLERANCE = '1.00';
/** The notification and the ticket of one payment are this close in time (± 48 h). */
export const RECEIPT_TIME_WINDOW_MS = 48 * 3_600_000;

export interface ReceiptMatchTarget {
  total: MoneyAmount;
  currency: Currency;
  /** ISO instant: when the ticket was issued, or when it was uploaded if unknown. */
  at: string;
}

export interface ReceiptMatchCandidate {
  id: string;
  amount: MoneyAmount;
  currency: Currency;
  occurredAt: string;
}

/**
 * The movement a ticket belongs to: same currency, total within $1 and time within 48 h.
 * Prefers the closest amount, then the closest time. Callers pass only expenses that have
 * no ticket yet and are not ignored.
 */
export function pickReceiptMatch<T extends ReceiptMatchCandidate>(
  target: ReceiptMatchTarget,
  candidates: readonly T[],
): T | null {
  const at = new Date(target.at).getTime();
  let best: { candidate: T; diff: MoneyAmount; distance: number } | null = null;
  for (const candidate of candidates) {
    if (candidate.currency !== target.currency) continue;
    const diff = absMoney(subtractMoney(candidate.amount, target.total));
    if (compareMoney(diff, RECEIPT_AMOUNT_TOLERANCE) > 0) continue;
    const distance = Math.abs(new Date(candidate.occurredAt).getTime() - at);
    if (distance > RECEIPT_TIME_WINDOW_MS) continue;
    const order = best ? compareMoney(diff, best.diff) : -1;
    if (order < 0 || (order === 0 && best && distance < best.distance)) {
      best = { candidate, diff, distance };
    }
  }
  return best?.candidate ?? null;
}
