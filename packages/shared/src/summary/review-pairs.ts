import { compareMoney } from '../money/money.js';
import { type SummaryTransactionInput } from './types.js';

/** A payment out of one of your accounts and money into another one, close in time. */
export const OWN_TRANSFER_WINDOW_MS = 30 * 60_000;
/** A detected movement and one you loaded by hand for the same payment. */
export const MANUAL_DUPLICATE_WINDOW_MS = 10 * 60_000;

export interface OwnTransferPair {
  outId: string;
  inId: string;
}

export interface DuplicatePair {
  /** Detected from a notification (TEMPLATE or LLM). */
  autoId: string;
  /** Loaded by hand. */
  manualId: string;
}

export interface ReviewPairs {
  ownTransferPairs: OwnTransferPair[];
  possibleDuplicatePairs: DuplicatePair[];
  /** Detected expenses still PENDING that are not part of a pair. */
  reviewTransactionIds: string[];
}

const time = (t: SummaryTransactionInput) => new Date(t.occurredAt).getTime();
const sameAmount = (a: SummaryTransactionInput, b: SummaryTransactionInput) =>
  a.currency === b.currency && compareMoney(a.amount, b.amount) === 0;
const isAuto = (t: SummaryTransactionInput) => t.origin !== 'MANUAL';

function closest<T extends SummaryTransactionInput>(
  target: SummaryTransactionInput,
  candidates: T[],
  windowMs: number,
  used: Set<string>,
): T | null {
  let best: T | null = null;
  for (const candidate of candidates) {
    if (used.has(candidate.id)) continue;
    const distance = Math.abs(time(candidate) - time(target));
    if (distance > windowMs) continue;
    if (!best || distance < Math.abs(time(best) - time(target))) best = candidate;
  }
  return best;
}

/**
 * Suggestions for Pendientes, from fields that already carry the user's answer, so nothing
 * extra is stored (ADR 010):
 * - Own transfer: an IN still PENDING (unclassified) matching an OUT from another source
 *   within 30 minutes. "Sí" marks both isOwnTransfer; "No" confirms the IN as income.
 * - Duplicate: a detected movement still PENDING matching a manual one within 10 minutes
 *   (the processor leaves such movements PENDING on purpose). "Es el mismo" ignores the
 *   manual one; "Son distintos" confirms the detected one.
 * Only suggests, never changes anything: a wrong guess must not invent or hide money.
 */
export function findReviewPairs(transactions: readonly SummaryTransactionInput[]): ReviewPairs {
  const live = transactions.filter((t) => t.status !== 'IGNORED' && !t.isOwnTransfer);
  const used = new Set<string>();

  const ownTransferPairs: OwnTransferPair[] = [];
  const pendingIns = live
    .filter((t) => t.direction === 'IN' && t.status === 'PENDING' && !t.isSalary && t.sourceId)
    .sort((a, b) => time(a) - time(b));
  for (const incoming of pendingIns) {
    const outs = live.filter(
      (t) =>
        t.direction === 'OUT' &&
        t.sourceId !== null &&
        t.sourceId !== incoming.sourceId &&
        t.commitmentId === null &&
        !t.isStatementPayment &&
        sameAmount(t, incoming),
    );
    const match = closest(incoming, outs, OWN_TRANSFER_WINDOW_MS, used);
    if (match) {
      used.add(match.id).add(incoming.id);
      ownTransferPairs.push({ outId: match.id, inId: incoming.id });
    }
  }

  const possibleDuplicatePairs: DuplicatePair[] = [];
  const pendingAutos = live
    .filter((t) => isAuto(t) && t.status === 'PENDING' && !used.has(t.id))
    .sort((a, b) => time(a) - time(b));
  const manuals = live.filter((t) => !isAuto(t));
  for (const auto of pendingAutos) {
    const candidates = manuals.filter((m) => m.direction === auto.direction && sameAmount(m, auto));
    const match = closest(auto, candidates, MANUAL_DUPLICATE_WINDOW_MS, used);
    if (match) {
      used.add(match.id).add(auto.id);
      possibleDuplicatePairs.push({ autoId: auto.id, manualId: match.id });
    }
  }

  const reviewTransactionIds = live
    .filter((t) => isAuto(t) && t.direction === 'OUT' && t.status === 'PENDING' && !used.has(t.id))
    .sort((a, b) => time(a) - time(b))
    .map((t) => t.id);

  return { ownTransferPairs, possibleDuplicatePairs, reviewTransactionIds };
}
