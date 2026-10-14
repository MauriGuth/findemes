import { compareMoney } from '../money/money.js';
import { type SummaryTransactionInput } from './types.js';

/** A payment out of one of your accounts and money into another one, close in time. */
export const OWN_TRANSFER_WINDOW_MS = 30 * 60_000;
/** A detected movement and one you loaded by hand for the same payment. */
export const MANUAL_DUPLICATE_WINDOW_MS = 10 * 60_000;
/** Bank emails arrive later than notifications, sometimes the next day. */
export const EMAIL_DUPLICATE_WINDOW_MS = 24 * 3_600_000;

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

export interface CrossChannelPair {
  /** Seen by a notification: more precise time and source. */
  keepId: string;
  /** The same payment read from an email. */
  dropId: string;
}

export interface ReviewPairs {
  ownTransferPairs: OwnTransferPair[];
  possibleDuplicatePairs: DuplicatePair[];
  crossChannelPairs: CrossChannelPair[];
  /** Detected expenses still PENDING that are not part of a pair. */
  reviewTransactionIds: string[];
}

const time = (t: SummaryTransactionInput) => new Date(t.occurredAt).getTime();
const sameAmount = (a: SummaryTransactionInput, b: SummaryTransactionInput) =>
  a.currency === b.currency && compareMoney(a.amount, b.amount) === 0;
const isAuto = (t: SummaryTransactionInput) => t.origin !== 'MANUAL';
const isEmail = (t: SummaryTransactionInput) => t.capturedVia === 'EMAIL';

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
 *   (24 hours when it came by email; the processor leaves such movements PENDING on
 *   purpose). "Es el mismo" ignores the manual one; "Son distintos" confirms the detected one.
 * - Cross-channel: an email movement still PENDING matching a notification movement within
 *   24 hours (ADR 013). "Es el mismo" ignores the email one; "Son distintos" confirms it.
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
    const window = isEmail(auto) ? EMAIL_DUPLICATE_WINDOW_MS : MANUAL_DUPLICATE_WINDOW_MS;
    const match = closest(auto, candidates, window, used);
    if (match) {
      used.add(match.id).add(auto.id);
      possibleDuplicatePairs.push({ autoId: auto.id, manualId: match.id });
    }
  }

  const crossChannelPairs: CrossChannelPair[] = [];
  const pendingEmails = live
    .filter((t) => isAuto(t) && isEmail(t) && t.status === 'PENDING' && !used.has(t.id))
    .sort((a, b) => time(a) - time(b));
  for (const email of pendingEmails) {
    const candidates = live.filter(
      (t) => isAuto(t) && !isEmail(t) && t.direction === email.direction && sameAmount(t, email),
    );
    const match = closest(email, candidates, EMAIL_DUPLICATE_WINDOW_MS, used);
    if (match) {
      used.add(match.id).add(email.id);
      crossChannelPairs.push({ keepId: match.id, dropId: email.id });
    }
  }

  const reviewTransactionIds = live
    .filter((t) => isAuto(t) && t.direction === 'OUT' && t.status === 'PENDING' && !used.has(t.id))
    .sort((a, b) => time(a) - time(b))
    .map((t) => t.id);

  return { ownTransferPairs, possibleDuplicatePairs, crossChannelPairs, reviewTransactionIds };
}
