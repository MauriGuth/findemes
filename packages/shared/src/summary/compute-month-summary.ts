import { daysLeftForMonth, formatIsoDate, isInArtDay, isInArtMonth } from '../dates/tz.js';
import {
  addMoney,
  compareMoney,
  divideMoney,
  isNegativeMoney,
  type MoneyAmount,
  normalizeMoney,
  subtractMoney,
  sumMoney,
} from '../money/money.js';
import { type PaymentMethod } from '../schemas/enums.js';
import {
  commitmentAppliesToMonth,
  commitmentIsCash,
  commitmentMonthState,
} from './commitment-schedule.js';
import {
  type CommitmentSummaryItem,
  type IncomeSource,
  type MonthSummary,
  type MonthSummaryInput,
  type SummaryTransactionInput,
} from './types.js';

const ZERO: MoneyAmount = '0.00';

function isCashMethod(method: PaymentMethod): boolean {
  return commitmentIsCash(method);
}

function nonNegative(amount: MoneyAmount): MoneyAmount {
  return isNegativeMoney(amount) ? ZERO : amount;
}

/** ARS, not ignored, not a transfer between own accounts. */
function isEligible(t: SummaryTransactionInput): boolean {
  return t.currency === 'ARS' && t.status !== 'IGNORED' && !t.isOwnTransfer;
}

/** An expense counts while pending or confirmed; an income only once confirmed. */
function counts(t: SummaryTransactionInput): boolean {
  return t.direction === 'OUT' ? t.status !== 'IGNORED' : t.status === 'CONFIRMED';
}

/**
 * The number at the top of the app, as a pure function of the month's data.
 *
 *   remaining = income − cash spent this month − unpaid cash commitments − unpaid previous statement
 *
 * See ADR 007 for the rules and the golden tests for the numbers.
 */
export function computeMonthSummary(input: MonthSummaryInput): MonthSummary {
  const { month, today } = input;
  const inMonth = (t: SummaryTransactionInput): boolean =>
    isInArtMonth(new Date(t.occurredAt), month);
  const eligible = input.transactions.filter(isEligible);
  const eligibleInMonth = eligible.filter(inMonth);

  // ── income ──
  const other = sumMoney(
    eligibleInMonth
      .filter((t) => t.direction === 'IN' && t.status === 'CONFIRMED' && !t.isSalary)
      .map((t) => t.amount),
  );
  const salary = input.plan?.salary ? normalizeMoney(input.plan.salary.amount) : null;
  const expected = input.plan ? normalizeMoney(input.plan.expectedIncome) : null;
  let base: MoneyAmount = ZERO;
  let source: IncomeSource = 'none';
  if (salary !== null) {
    base = salary;
    source = 'confirmed';
  } else if (expected !== null) {
    base = expected;
    source = 'expected';
  } else if (input.previousPlan) {
    base = normalizeMoney(input.previousPlan.salaryAmount ?? input.previousPlan.expectedIncome);
    source = 'carried';
  }
  const incomeTotal = addMoney(base, other);

  // ── spent ──
  const outs = eligibleInMonth.filter((t) => t.direction === 'OUT' && counts(t));
  const spentCash = sumMoney(outs.filter((t) => isCashMethod(t.method)).map((t) => t.amount));
  const spentCredit = sumMoney(outs.filter((t) => !isCashMethod(t.method)).map((t) => t.amount));
  const spentToday = sumMoney(
    outs
      .filter((t) => isCashMethod(t.method) && isInArtDay(new Date(t.occurredAt), today))
      .map((t) => t.amount),
  );

  // ── commitments ──
  const payments = eligible.filter(
    (t) =>
      t.direction === 'OUT' && counts(t) && t.commitmentId !== null && t.commitmentMonth === month,
  );
  const items: CommitmentSummaryItem[] = [];
  let unpaidCash = ZERO;
  let unpaidCredit = ZERO;
  let paidCash = ZERO;
  let paidCredit = ZERO;
  const unpaidDueCommitmentIds: string[] = [];
  const todayIso = formatIsoDate(today);

  for (const c of input.commitments) {
    const applies = commitmentAppliesToMonth(c, month);
    const own = payments.filter((t) => t.commitmentId === c.id);
    if (!applies && own.length === 0) continue;

    const paidAmount = sumMoney(own.map((t) => t.amount));
    const unpaidAmount = applies ? nonNegative(subtractMoney(c.amount, paidAmount)) : ZERO;
    const state = commitmentMonthState(c, month);
    const cash = commitmentIsCash(c.method);

    if (cash) unpaidCash = addMoney(unpaidCash, unpaidAmount);
    else unpaidCredit = addMoney(unpaidCredit, unpaidAmount);
    for (const t of own) {
      if (isCashMethod(t.method)) paidCash = addMoney(paidCash, t.amount);
      else paidCredit = addMoney(paidCredit, t.amount);
    }

    const paid = unpaidAmount === ZERO;
    if (applies && !paid && state.dueOn <= todayIso) unpaidDueCommitmentIds.push(c.id);

    items.push({
      id: c.id,
      name: c.name,
      kind: c.kind,
      amount: normalizeMoney(c.amount),
      method: c.method,
      dueOn: state.dueOn,
      paid,
      paidAmount,
      unpaidAmount,
      transactionIds: own.map((t) => t.id),
      installmentNumber: applies ? state.installmentNumber : null,
      installmentsLeft: applies ? state.installmentsLeft : null,
    });
  }

  // ── previous statement ──
  const previousAmount = normalizeMoney(input.previousStatement);
  const statementPaidAmount = sumMoney(
    outs.filter((t) => isCashMethod(t.method) && t.isStatementPayment).map((t) => t.amount),
  );
  const statementPaid = compareMoney(statementPaidAmount, previousAmount) >= 0;
  const unpaidStatement = nonNegative(subtractMoney(previousAmount, statementPaidAmount));

  // ── the number ──
  const remaining = subtractMoney(
    subtractMoney(subtractMoney(incomeTotal, spentCash), unpaidCash),
    unpaidStatement,
  );
  const nextStatement = addMoney(spentCredit, unpaidCredit);
  const daysLeft = daysLeftForMonth(month, today);
  const perDay =
    daysLeft > 0 && compareMoney(remaining, ZERO) > 0 ? divideMoney(remaining, daysLeft) : null;

  // ── USD, listed apart, never converted ──
  const usdTx = input.transactions.filter(
    (t) => t.currency === 'USD' && t.status !== 'IGNORED' && !t.isOwnTransfer && inMonth(t),
  );
  const usdSpent = sumMoney(usdTx.filter((t) => t.direction === 'OUT').map((t) => t.amount));
  const usdIncome = sumMoney(
    usdTx.filter((t) => t.direction === 'IN' && t.status === 'CONFIRMED').map((t) => t.amount),
  );

  // ── what the app must ask the user ──
  const salaryCandidateIds = eligibleInMonth
    .filter((t) => t.direction === 'IN' && t.status === 'PENDING' && !t.isSalary)
    .map((t) => t.id);

  return {
    month,
    today: todayIso,
    daysLeft,
    income: { total: incomeTotal, source, salary, expected, other },
    spent: { cash: spentCash, credit: spentCredit, today: spentToday },
    commitments: { unpaidCash, unpaidCredit, paidCash, paidCredit, items },
    statement: {
      previous: { amount: previousAmount, paid: statementPaid, paidAmount: statementPaidAmount },
      next: nextStatement,
    },
    remaining,
    perDay,
    usd: { spent: usdSpent, income: usdIncome },
    pending: {
      needsPlan: input.plan === null,
      needsSalaryConfirmation: salary === null && salaryCandidateIds.length > 0,
      salaryCandidateIds,
      needsStatementPayment: !statementPaid,
      unpaidDueCommitmentIds,
    },
  };
}
