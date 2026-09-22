import { describe, expect, it } from 'vitest';

import { CreateTransactionSchema, TransactionSchema } from '../transaction.js';

const valid = {
  id: '019965f0-1b2c-7d3e-8f4a-5b6c7d8e9f01',
  userId: '019965f0-1b2c-7d3e-8f4a-5b6c7d8e9f02',
  sourceId: null,
  amount: '1234.56',
  currency: 'ARS',
  direction: 'OUT',
  method: 'DEBIT',
  merchantRaw: 'CARREFOUR EXPRESS',
  merchantNorm: 'carrefour',
  categoryId: null,
  occurredAt: '2026-09-21T15:04:05.000Z',
  capturedAt: '2026-09-21T15:04:06.000Z',
  status: 'CONFIRMED',
  confidence: 0.95,
  origin: 'TEMPLATE',
  fingerprint: 'abc123',
  rawEventId: null,
  receiptId: null,
  note: null,
  isOwnTransfer: false,
  commitmentId: null,
  commitmentMonth: null,
  isStatementPayment: false,
  isSalary: false,
  createdAt: '2026-09-21T15:04:06.000Z',
  updatedAt: '2026-09-21T15:04:06.000Z',
};

describe('TransactionSchema', () => {
  it('accepts a well-formed transaction', () => {
    expect(TransactionSchema.parse(valid)).toEqual(valid);
  });

  it('rejects float amounts and bad enums', () => {
    expect(TransactionSchema.safeParse({ ...valid, amount: 1234.56 }).success).toBe(false);
    expect(TransactionSchema.safeParse({ ...valid, amount: '1.234,56' }).success).toBe(false);
    expect(TransactionSchema.safeParse({ ...valid, method: 'BITCOIN' }).success).toBe(false);
    expect(TransactionSchema.safeParse({ ...valid, confidence: 1.5 }).success).toBe(false);
  });
});

describe('CreateTransactionSchema', () => {
  it('fills defaults for a quick manual entry', () => {
    const result = CreateTransactionSchema.parse({ amount: '500', method: 'CASH' });
    expect(result).toEqual({
      amount: '500',
      method: 'CASH',
      currency: 'ARS',
      direction: 'OUT',
      isOwnTransfer: false,
      isStatementPayment: false,
      markAsSalary: false,
    });
  });

  it('explains errors in Spanish', () => {
    const result = CreateTransactionSchema.safeParse({ amount: '-500', method: 'CASH' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('El monto tiene que ser mayor a cero');
    }
  });

  it('rejects unknown fields', () => {
    expect(CreateTransactionSchema.safeParse({ amount: '1', method: 'CASH', foo: 1 }).success).toBe(
      false,
    );
  });
});
