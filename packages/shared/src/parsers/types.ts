import { type MoneyAmount } from '../money/money.js';
import { type Currency, type PaymentMethod, type TransactionDirection } from '../schemas/enums.js';

/**
 * How a template turns regex groups into a movement. Stored as `ParserTemplate.fieldMap`.
 * Direction and method are fixed per template: a template describes one kind of
 * notification ("Pagaste $X en Y"), never several.
 */
export interface TemplateFieldMap {
  direction: TransactionDirection;
  method: PaymentMethod;
  /** Fixed currency; when absent, a `currency` group decides (US$/USD → USD) or ARS. */
  currency?: Currency;
  /** Regex group with the amount. Default "amount". */
  amountGroup?: string;
  /** Regex group with the merchant or counterpart. Default "merchant". */
  merchantGroup?: string;
  /** Merchant to use when the text has none ("Transferencia recibida"). */
  merchantFixed?: string;
  /** RegExp flags. Default "iu". */
  flags?: string;
}

/** A template as the engine consumes it: a `ParserTemplate` row or a code definition. */
export interface ParserTemplateData {
  id: string;
  name: string;
  pattern: string;
  priority: number;
  /** 0–1. ≥ 0.90 is confirmed without asking; 0.60–0.89 asks. */
  confidence: number;
  fieldMap: TemplateFieldMap;
}

/** The texts a notification carries, as the Android listener extracts them. */
export interface NotificationParts {
  title?: string | null;
  text?: string | null;
  bigText?: string | null;
  subText?: string | null;
}

export interface ParsedNotification {
  amount: MoneyAmount;
  currency: Currency;
  direction: TransactionDirection;
  method: PaymentMethod;
  merchantRaw: string | null;
  merchantNorm: string | null;
  confidence: number;
  templateId: string;
}
