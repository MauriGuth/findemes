import { z } from 'zod';

import { IsoDateTimeSchema } from './common.js';

const Text = z.string().max(4000).nullable().optional();

/** One notification as the Android listener captured it. Text fields are never logged. */
export const IngestNotificationSchema = z.strictObject({
  /** StatusBarNotification.key: stable across updates of the same notification. */
  key: z.string().min(1).max(300),
  packageName: z.string().min(1).max(200),
  /** StatusBarNotification.postTime as ISO. */
  postedAt: IsoDateTimeSchema,
  title: Text,
  text: Text,
  bigText: Text,
  subText: Text,
});
export type IngestNotification = z.infer<typeof IngestNotificationSchema>;

export const IngestBatchSchema = z.strictObject({
  items: z.array(IngestNotificationSchema).min(1).max(50),
});
export type IngestBatch = z.infer<typeof IngestBatchSchema>;

export const IngestResultSchema = z
  .object({
    /** Stored and processed. */
    accepted: z.number().int(),
    /** Already received (same device, key and time). */
    duplicates: z.number().int(),
    /** Outside the whitelist: dropped without storing anything. */
    rejected: z.number().int(),
  })
  .meta({ id: 'IngestResult' });
export type IngestResult = z.infer<typeof IngestResultSchema>;

export const IngestConfigSchema = z
  .object({
    /** Android package names the listener may read. Everything else is ignored on-device. */
    packages: z.array(z.string()),
  })
  .meta({ id: 'IngestConfig' });
export type IngestConfig = z.infer<typeof IngestConfigSchema>;

export const IngestTokenSchema = z
  .object({
    /** Shown once. Only authorizes /ingest/*. */
    token: z.string(),
    issuedAt: IsoDateTimeSchema,
    rotateAfterDays: z.number().int(),
    /** Whitelist to hand to the native listener right away. */
    packages: z.array(z.string()),
  })
  .meta({ id: 'IngestToken' });
export type IngestToken = z.infer<typeof IngestTokenSchema>;

/**
 * What an iPhone Shortcut sends (Phase 6, ADR 016): the text of a bank SMS or notification
 * it received, or an Apple Pay transaction's fields. Authenticated with the ingest token.
 */
export const ShortcutEventSchema = z
  .strictObject({
    kind: z.enum(['message', 'apple_pay']).default('message'),
    /** The message as received ("Shortcut Input"); required for kind=message. */
    text: z.string().trim().max(4000).optional(),
    /** Who sent it: SMS sender or app name, if the Shortcut has it. */
    sender: z.string().trim().max(120).optional(),
    /** Apple Pay "Amount", as the iPhone formats it ("$ 1.234,56"). */
    amount: z.string().trim().max(40).optional(),
    /** Apple Pay "Merchant". */
    merchant: z.string().trim().max(200).optional(),
    /** Apple Pay "Card" (the card's name in Wallet). */
    card: z.string().trim().max(120).optional(),
  })
  .refine((v) => (v.kind === 'message' ? !!v.text : !!v.amount), {
    error: 'Falta el texto del mensaje o el monto',
  });
export type ShortcutEventInput = z.input<typeof ShortcutEventSchema>;
export type ShortcutEvent = z.output<typeof ShortcutEventSchema>;

export const ShortcutResultSchema = z
  .object({
    /** movement: recorded; duplicate: already received; ignored: not a money message. */
    outcome: z.enum(['movement', 'duplicate', 'ignored']),
  })
  .meta({ id: 'ShortcutResult' });
export type ShortcutResult = z.infer<typeof ShortcutResultSchema>;
