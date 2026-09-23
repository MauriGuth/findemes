import { type CalendarDate, type IsoDate, type MonthKey } from '../dates/tz.js';
import { type MoneyAmount } from '../money/money.js';
import {
  type CommitmentKind,
  type Currency,
  type PaymentMethod,
  type TransactionDirection,
  type TransactionOrigin,
  type TransactionStatus,
} from '../schemas/enums.js';

export interface SummaryTransactionInput {
  id: string;
  amount: MoneyAmount;
  currency: Currency;
  direction: TransactionDirection;
  method: PaymentMethod;
  status: TransactionStatus;
  /** ISO instant */
  occurredAt: string;
  isOwnTransfer: boolean;
  commitmentId: string | null;
  /** Month the payment settles ("YYYY-MM"); required when commitmentId is set. */
  commitmentMonth: MonthKey | null;
  isStatementPayment: boolean;
  /** Linked as the salary of SOME MonthPlan (back-relation). */
  isSalary: boolean;
  /** MANUAL, or detected from a notification (TEMPLATE / LLM). */
  origin: TransactionOrigin;
  sourceId: string | null;
}

export interface SummaryCommitmentInput {
  id: string;
  name: string;
  kind: CommitmentKind;
  amount: MoneyAmount;
  currency: Currency;
  method: PaymentMethod;
  dayOfMonth: number;
  startsOn: IsoDate;
  endsOn: IsoDate | null;
  installmentsTotal: number | null;
  active: boolean;
}

export interface MonthSummaryInput {
  month: MonthKey;
  /** Injected; never Date.now(). */
  today: CalendarDate;
  plan: {
    expectedIncome: MoneyAmount;
    salary: { transactionId: string; amount: MoneyAmount } | null;
  } | null;
  /** Previous month's plan, used to carry the income over while the new month is unconfirmed. */
  previousPlan: { expectedIncome: MoneyAmount; salaryAmount: MoneyAmount | null } | null;
  /** spent.credit(M−1) + unpaidCredit(M−1); "0.00" when unknown. */
  previousStatement: MoneyAmount;
  /** All the user's commitments, active or not. */
  commitments: SummaryCommitmentInput[];
  /** Transactions of the month (occurredAt in monthRange) plus the ones settling a commitment in this month. */
  transactions: SummaryTransactionInput[];
}

export type IncomeSource = 'confirmed' | 'expected' | 'carried' | 'none';

export interface CommitmentSummaryItem {
  id: string;
  name: string;
  kind: CommitmentKind;
  amount: MoneyAmount;
  method: PaymentMethod;
  dueOn: IsoDate;
  paid: boolean;
  paidAmount: MoneyAmount;
  unpaidAmount: MoneyAmount;
  transactionIds: string[];
  installmentNumber: number | null;
  installmentsLeft: number | null;
}

export interface MonthSummary {
  month: MonthKey;
  today: IsoDate;
  daysLeft: number;
  income: {
    total: MoneyAmount;
    source: IncomeSource;
    salary: MoneyAmount | null;
    expected: MoneyAmount | null;
    other: MoneyAmount;
  };
  spent: { cash: MoneyAmount; credit: MoneyAmount; today: MoneyAmount };
  commitments: {
    unpaidCash: MoneyAmount;
    unpaidCredit: MoneyAmount;
    paidCash: MoneyAmount;
    paidCredit: MoneyAmount;
    items: CommitmentSummaryItem[];
  };
  statement: {
    previous: { amount: MoneyAmount; paid: boolean; paidAmount: MoneyAmount };
    next: MoneyAmount;
  };
  remaining: MoneyAmount;
  perDay: MoneyAmount | null;
  usd: { spent: MoneyAmount; income: MoneyAmount };
  pending: {
    needsPlan: boolean;
    needsSalaryConfirmation: boolean;
    salaryCandidateIds: string[];
    needsStatementPayment: boolean;
    unpaidDueCommitmentIds: string[];
    /** Detected expenses to confirm (Phase 2). */
    reviewTransactionIds: string[];
    ownTransferPairs: { outId: string; inId: string }[];
    possibleDuplicatePairs: { autoId: string; manualId: string }[];
  };
}
