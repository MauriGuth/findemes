import { z } from 'zod';

/**
 * Enums shared by the API, the mobile app and the Prisma schema.
 * The values must match `apps/api/prisma/schema.prisma` exactly; a test in this
 * package reads the Prisma schema and fails if they drift.
 */
export const Currency = z.enum(['ARS', 'USD']);
export type Currency = z.infer<typeof Currency>;

export const TransactionDirection = z.enum(['IN', 'OUT']);
export type TransactionDirection = z.infer<typeof TransactionDirection>;

/** Debit, transfer, wallet and cash leave the account today; credit goes to next month's statement. */
export const PaymentMethod = z.enum(['DEBIT', 'CREDIT', 'TRANSFER', 'CASH', 'WALLET']);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const TransactionStatus = z.enum(['PENDING', 'CONFIRMED', 'IGNORED']);
export type TransactionStatus = z.infer<typeof TransactionStatus>;

export const TransactionOrigin = z.enum(['TEMPLATE', 'LLM', 'MANUAL']);
export type TransactionOrigin = z.infer<typeof TransactionOrigin>;

export const RawEventChannel = z.enum([
  'ANDROID_NOTIFICATION',
  'IOS_SHORTCUT',
  'EMAIL',
  'RECEIPT_PHOTO',
  'MANUAL',
]);
export type RawEventChannel = z.infer<typeof RawEventChannel>;

export const RawEventStatus = z.enum(['RECEIVED', 'PROCESSED', 'UNRECOGNIZED', 'FAILED']);
export type RawEventStatus = z.infer<typeof RawEventStatus>;

export const SourceKind = z.enum(['BANK', 'WALLET', 'CARD']);
export type SourceKind = z.infer<typeof SourceKind>;

export const DevicePlatform = z.enum(['ANDROID', 'IOS']);
export type DevicePlatform = z.infer<typeof DevicePlatform>;

export const CommitmentKind = z.enum(['RENT', 'SERVICE', 'INSTALLMENT', 'SUBSCRIPTION', 'DEBIT']);
export type CommitmentKind = z.infer<typeof CommitmentKind>;

export const ReceiptStatus = z.enum(['UPLOADED', 'EXTRACTED', 'MATCHED', 'UNMATCHED', 'FAILED']);
export type ReceiptStatus = z.infer<typeof ReceiptStatus>;

/** What a bill is for (Phase 3, ADR 013). CARD_STATEMENT replaces the estimated statement. */
export const BillKind = z.enum([
  'CARD_STATEMENT',
  'UTILITY',
  'EDUCATION',
  'HEALTH',
  'TAX',
  'SUBSCRIPTION',
  'OTHER',
]);
export type BillKind = z.infer<typeof BillKind>;

/** PENDING = detected, waiting for the user; PENDING and UNPAID both count as owed. */
export const BillStatus = z.enum(['PENDING', 'UNPAID', 'PAID', 'IGNORED']);
export type BillStatus = z.infer<typeof BillStatus>;

export const BillOrigin = z.enum(['EMAIL', 'MANUAL']);
export type BillOrigin = z.infer<typeof BillOrigin>;

/** Registry used by the Prisma drift test. Keys are the Prisma enum names. */
export const PRISMA_ENUMS = {
  Currency,
  TransactionDirection,
  PaymentMethod,
  TransactionStatus,
  TransactionOrigin,
  RawEventChannel,
  RawEventStatus,
  SourceKind,
  DevicePlatform,
  CommitmentKind,
  ReceiptStatus,
  BillKind,
  BillStatus,
  BillOrigin,
} as const;
