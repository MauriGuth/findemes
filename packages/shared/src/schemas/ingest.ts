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
  })
  .meta({ id: 'IngestToken' });
export type IngestToken = z.infer<typeof IngestTokenSchema>;
