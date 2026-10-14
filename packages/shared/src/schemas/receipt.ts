import { z } from 'zod';

import { IsoDateTimeSchema, MoneyAmountSchema, PositiveMoneySchema, UuidSchema } from './common.js';
import { Currency, PaymentMethod, ReceiptStatus, TransactionDirection } from './enums.js';

export const ReceiptItemSchema = z.object({
  name: z.string(),
  qty: z.string(),
  unitPrice: MoneyAmountSchema.nullable(),
  total: MoneyAmountSchema,
  categoryId: UuidSchema.nullable(),
});
export type ReceiptItem = z.infer<typeof ReceiptItemSchema>;

/** A photo of a ticket and what Claude read from it (Phase 4, ADR 014). */
export const ReceiptSchema = z
  .object({
    id: UuidSchema,
    status: ReceiptStatus,
    merchant: z.string().nullable(),
    cuit: z.string().nullable(),
    issuedAt: IsoDateTimeSchema.nullable(),
    total: MoneyAmountSchema.nullable(),
    currency: Currency,
    paymentMethodHint: PaymentMethod.nullable(),
    items: z.array(ReceiptItemSchema),
    /** The movement it was matched to, or the one created from it. */
    transactionId: UuidSchema.nullable(),
    /** Signed URL to see the photo, valid for a few minutes. */
    imageUrl: z.string().nullable(),
    error: z.string().nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .meta({ id: 'Receipt' });
export type Receipt = z.infer<typeof ReceiptSchema>;

export const ReceiptUploadSchema = z
  .object({ key: z.string(), url: z.string(), expiresAt: IsoDateTimeSchema })
  .meta({ id: 'ReceiptUpload' });
export type ReceiptUpload = z.infer<typeof ReceiptUploadSchema>;

export const CreateReceiptSchema = z.strictObject({
  key: z.string().regex(/^receipts\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/, {
    error: 'Foto inválida',
  }),
});
export type CreateReceiptInput = z.input<typeof CreateReceiptSchema>;

/** "Gasté 50 lucas en el súper y 20 en el taxi" (Phase 4). */
export const ParseEntrySchema = z.strictObject({
  text: z.string().trim().min(2, { error: 'Contanos qué gastaste' }).max(1000),
});
export type ParseEntryInput = z.input<typeof ParseEntrySchema>;

export const EntryDraftSchema = z.object({
  amount: PositiveMoneySchema,
  currency: Currency,
  direction: TransactionDirection,
  method: PaymentMethod,
  merchantRaw: z.string().trim().max(200, 'El nombre es demasiado largo').nullable(),
  categoryId: UuidSchema.nullable(),
  occurredAt: IsoDateTimeSchema.nullable(),
});
export type EntryDraft = z.infer<typeof EntryDraftSchema>;

export const EntryDraftListSchema = z
  .object({ drafts: z.array(EntryDraftSchema) })
  .meta({ id: 'EntryDraftList' });

export const SaveEntriesSchema = z.strictObject({
  drafts: z.array(EntryDraftSchema).min(1).max(20),
});
export type SaveEntriesInput = z.input<typeof SaveEntriesSchema>;

/** Linking a chat (Telegram / WhatsApp) to the account. */
export const ChatLinkSchema = z
  .object({
    telegram: z
      .object({ available: z.boolean(), linked: z.boolean(), url: z.string().nullable() })
      .meta({ id: 'TelegramLink' }),
    whatsapp: z
      .object({
        available: z.boolean(),
        linked: z.boolean(),
        /** The number to write to, e.g. "+54 9 299 …". */
        number: z.string().nullable(),
        /** What to send from your phone to link it: "vincular 123456". */
        message: z.string().nullable(),
      })
      .meta({ id: 'WhatsappLink' }),
  })
  .meta({ id: 'ChatLink' });
export type ChatLink = z.infer<typeof ChatLinkSchema>;

export const ReceiptListSchema = z
  .object({ items: z.array(ReceiptSchema) })
  .meta({ id: 'ReceiptList' });

/** Which optional integrations this server has configured (ADR 014). */
export const FeaturesSchema = z
  .object({
    /** Ticket photos: bucket + Claude. */
    receipts: z.boolean(),
    /** "Gasté 8 lucas en el kiosco": Claude. */
    aiEntries: z.boolean(),
    telegram: z.boolean(),
    whatsapp: z.boolean(),
  })
  .meta({ id: 'Features' });
export type Features = z.infer<typeof FeaturesSchema>;
