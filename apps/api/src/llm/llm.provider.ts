import { type Currency, type PaymentMethod, type TransactionDirection } from '@findemes/shared';

/** What Claude extracts from a notification no template recognized. */
export interface NotificationExtraction {
  /** False for promos, login alerts, OTP codes, pending or rejected operations. */
  isFinancial: boolean;
  /** Canonical decimal ("1234.56") when isFinancial. */
  amount: string | null;
  currency: Currency | null;
  direction: TransactionDirection | null;
  method: PaymentMethod | null;
  merchant: string | null;
}

export interface LlmResult<T> {
  value: T;
  /** The model that answered (may differ from the requested one after a server-side fallback). */
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface NotificationExtractionInput {
  /** Name of the bank or wallet the notification came from. */
  sourceName: string;
  /** notificationText(): untrusted; never logged. */
  text: string;
}

/** Behind an interface so tests use a fake and the model can change with LLM_MODEL (ADR 010). */
export interface LlmProvider {
  readonly name: string;
  extractNotification(
    input: NotificationExtractionInput,
  ): Promise<LlmResult<NotificationExtraction>>;
}

/** null when LLM_PROVIDER=none: unmatched notifications stay UNRECOGNIZED. */
export const LLM_PROVIDER = Symbol('LLM_PROVIDER');

/** USD per million tokens (input, output). Unknown models are billed at the most expensive row. */
const PRICES: Record<string, [number, number]> = {
  'claude-fable-5-1': [10, 50],
  'claude-opus-5-5': [4, 20],
  'claude-opus-5': [5, 25],
  'claude-sonnet-5': [2, 10],
  'claude-haiku-4-5': [1, 5],
};

/** USD × 1e6 for LlmUsage.costMicros ($1 per million tokens = 1 micro-dollar per token). */
export function costMicros(model: string, inputTokens: number, outputTokens: number): number {
  const key = Object.keys(PRICES)
    .sort((a, b) => b.length - a.length)
    .find((prefix) => model.startsWith(prefix));
  const [input, output] = key ? (PRICES[key] ?? [10, 50]) : [10, 50];
  return Math.round(inputTokens * input + outputTokens * output);
}
