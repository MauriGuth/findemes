import { parseArs } from '../money/parse.js';
import { type Currency } from '../schemas/enums.js';
import { normalizeMerchant } from './merchant.js';
import {
  type NotificationParts,
  type ParsedNotification,
  type ParserTemplateData,
} from './types.js';

/**
 * The text templates run against: title, then the long text when the app provides
 * one (it contains the short one), otherwise the short text; subText last. Fixtures
 * store exactly this string.
 */
export function notificationText(parts: NotificationParts): string {
  const body = parts.bigText?.trim() || parts.text?.trim() || '';
  return [parts.title?.trim(), body, parts.subText?.trim()]
    .filter((line): line is string => !!line)
    .join('\n');
}

const USD_TOKEN = /US\$|U\$S|USD|D[OÓ]LAR/iu;

function compile(template: ParserTemplateData): RegExp | null {
  try {
    return new RegExp(template.pattern, template.fieldMap.flags ?? 'iu');
  } catch {
    return null;
  }
}

/** First template (lowest priority number, then name) whose regex matches with a valid amount. */
export function parseNotification(
  text: string,
  templates: readonly ParserTemplateData[],
): ParsedNotification | null {
  const ordered = [...templates].sort(
    (a, b) => a.priority - b.priority || a.name.localeCompare(b.name),
  );
  for (const template of ordered) {
    const regex = compile(template);
    const groups = regex?.exec(text)?.groups;
    if (!groups) continue;

    const { fieldMap } = template;
    const amountText = groups[fieldMap.amountGroup ?? 'amount'];
    const amount = amountText ? parseArs(amountText) : null;
    if (!amount || amount.startsWith('-') || /^0+(\.0+)?$/.test(amount)) continue;

    const currencyText = groups['currency'];
    const currency: Currency =
      fieldMap.currency ?? (currencyText && USD_TOKEN.test(currencyText) ? 'USD' : 'ARS');

    const merchantText = groups[fieldMap.merchantGroup ?? 'merchant']?.trim();
    const merchantRaw = (merchantText || fieldMap.merchantFixed || null)?.slice(0, 500) ?? null;

    return {
      amount,
      currency,
      direction: fieldMap.direction,
      method: fieldMap.method,
      merchantRaw,
      merchantNorm: normalizeMerchant(merchantRaw),
      confidence: template.confidence,
      templateId: template.id,
    };
  }
  return null;
}

/** ≥ 0.90 → confirmed without asking; below → the user reviews it in Pendientes. */
export const AUTO_CONFIRM_CONFIDENCE = 0.9;

/**
 * The dedup key before hashing (the API hashes it with sha256): same user, source,
 * amount, 2-minute bucket and merchant = same movement. Pure so it can run on-device later.
 */
export function fingerprintInput(input: {
  userId: string;
  sourceId: string | null;
  amount: string;
  occurredAt: Date;
  merchantNorm: string | null;
}): string {
  const bucket = Math.floor(input.occurredAt.getTime() / 120_000);
  return [
    input.userId,
    input.sourceId ?? '-',
    input.amount,
    String(bucket),
    input.merchantNorm ?? '-',
  ].join('|');
}
