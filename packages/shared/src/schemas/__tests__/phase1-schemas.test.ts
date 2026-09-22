import { describe, expect, it } from 'vitest';

import { computeMonthSummary } from '../../summary/compute-month-summary.js';
import { EmailSchema, LoginCodeSchema, VerifyLoginCodeSchema } from '../auth.js';
import { CreateCommitmentSchema, UpsertMonthPlanSchema } from '../plan.js';
import { MonthSummarySchema } from '../summary.js';
import {
  CreateInstallmentPurchaseSchema,
  CreateTransactionSchema,
  UpdateTransactionSchema,
} from '../transaction.js';
import { ReminderTimeSchema, UpdateUserSchema } from '../user.js';

const uuid = '019965f0-1b2c-7d3e-8f4a-5b6c7d8e9f01';

function firstMessage(result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}): string | undefined {
  return result.success ? undefined : result.error?.issues[0]?.message;
}

describe('auth schemas', () => {
  it('normalizes the email before validating it', () => {
    expect(EmailSchema.parse('  Mau@Example.COM ')).toBe('mau@example.com');
    expect(firstMessage(EmailSchema.safeParse('mau@'))).toBe('Ese mail no parece válido');
  });

  it('accepts only six digits as a code', () => {
    expect(LoginCodeSchema.parse('012345')).toBe('012345');
    expect(LoginCodeSchema.safeParse('12345').success).toBe(false);
    expect(LoginCodeSchema.safeParse('abcdef').success).toBe(false);
  });

  it('requires the device platform and rejects unknown keys', () => {
    expect(
      VerifyLoginCodeSchema.safeParse({
        email: 'a@b.co',
        code: '123456',
        device: { platform: 'ANDROID' },
      }).success,
    ).toBe(true);
    expect(
      VerifyLoginCodeSchema.safeParse({
        email: 'a@b.co',
        code: '123456',
        device: { platform: 'WEB' },
      }).success,
    ).toBe(false);
    expect(
      VerifyLoginCodeSchema.safeParse({
        email: 'a@b.co',
        code: '123456',
        device: { platform: 'IOS' },
        extra: 1,
      }).success,
    ).toBe(false);
  });
});

describe('user schemas', () => {
  it('validates the reminder time', () => {
    expect(ReminderTimeSchema.parse('20:00')).toBe('20:00');
    expect(ReminderTimeSchema.safeParse('24:00').success).toBe(false);
    expect(ReminderTimeSchema.safeParse('8:00').success).toBe(false);
    expect(UpdateUserSchema.safeParse({}).success).toBe(false);
    expect(UpdateUserSchema.safeParse({ dailyReminderTime: null }).success).toBe(true);
  });
});

describe('transaction schemas', () => {
  it('fills defaults for a quick expense', () => {
    expect(CreateTransactionSchema.parse({ amount: '500', method: 'CASH' })).toEqual({
      amount: '500',
      method: 'CASH',
      currency: 'ARS',
      direction: 'OUT',
      isOwnTransfer: false,
      isStatementPayment: false,
      markAsSalary: false,
    });
  });

  it('only an ARS income can be the salary', () => {
    expect(
      firstMessage(
        CreateTransactionSchema.safeParse({ amount: '1', method: 'DEBIT', markAsSalary: true }),
      ),
    ).toBe('Solo un ingreso puede ser tu sueldo');
    expect(
      firstMessage(
        CreateTransactionSchema.safeParse({
          amount: '1',
          method: 'DEBIT',
          direction: 'IN',
          currency: 'USD',
          markAsSalary: true,
        }),
      ),
    ).toBe('Por ahora el sueldo tiene que ser en pesos');
    expect(
      CreateTransactionSchema.safeParse({
        amount: '1',
        method: 'DEBIT',
        direction: 'IN',
        markAsSalary: true,
      }).success,
    ).toBe(true);
  });

  it('commitment payments and statement payments are cash expenses', () => {
    expect(
      CreateTransactionSchema.safeParse({
        amount: '1',
        method: 'DEBIT',
        direction: 'IN',
        commitmentId: uuid,
      }).success,
    ).toBe(false);
    expect(
      CreateTransactionSchema.safeParse({ amount: '1', method: 'CREDIT', isStatementPayment: true })
        .success,
    ).toBe(false);
    expect(
      CreateTransactionSchema.safeParse({ amount: '1', method: 'DEBIT', isStatementPayment: true })
        .success,
    ).toBe(true);
    expect(
      CreateTransactionSchema.safeParse({
        amount: '1',
        method: 'TRANSFER',
        isOwnTransfer: true,
        commitmentId: uuid,
      }).success,
    ).toBe(false);
  });

  it('rejects zero, negative and malformed amounts', () => {
    expect(firstMessage(CreateTransactionSchema.safeParse({ amount: '0', method: 'CASH' }))).toBe(
      'El monto tiene que ser mayor a cero',
    );
    expect(CreateTransactionSchema.safeParse({ amount: '-5', method: 'CASH' }).success).toBe(false);
    expect(CreateTransactionSchema.safeParse({ amount: '1.234,5', method: 'CASH' }).success).toBe(
      false,
    );
    expect(CreateTransactionSchema.safeParse({ amount: '1', method: 'CASH', foo: 1 }).success).toBe(
      false,
    );
  });

  it('updates need at least one field', () => {
    expect(UpdateTransactionSchema.safeParse({}).success).toBe(false);
    expect(UpdateTransactionSchema.safeParse({ status: 'IGNORED' }).success).toBe(true);
  });

  it('installment purchases need at least two installments', () => {
    expect(
      CreateInstallmentPurchaseSchema.safeParse({
        total: '600000',
        installments: 6,
        name: 'Heladera',
      }).success,
    ).toBe(true);
    expect(
      firstMessage(
        CreateInstallmentPurchaseSchema.safeParse({
          total: '600000',
          installments: 1,
          name: 'Heladera',
        }),
      ),
    ).toBe('Son al menos 2 cuotas');
  });
});

describe('plan schemas', () => {
  it('asks how many installments', () => {
    expect(
      firstMessage(
        CreateCommitmentSchema.safeParse({
          kind: 'INSTALLMENT',
          name: 'Heladera',
          amount: '100000',
          dayOfMonth: 15,
        }),
      ),
    ).toBe('¿Cuántas cuotas son?');
    const ok = CreateCommitmentSchema.parse({
      kind: 'INSTALLMENT',
      name: 'Heladera',
      amount: '100000',
      dayOfMonth: 15,
      installmentsTotal: 6,
      startsOn: '2026-06',
    });
    expect(ok).toMatchObject({ currency: 'ARS', method: 'DEBIT' });
  });

  it('validates the due day and the month order', () => {
    expect(
      firstMessage(
        CreateCommitmentSchema.safeParse({
          kind: 'RENT',
          name: 'Alquiler',
          amount: '1',
          dayOfMonth: 32,
        }),
      ),
    ).toBe('El día tiene que estar entre 1 y 31');
    expect(
      firstMessage(
        CreateCommitmentSchema.safeParse({
          kind: 'RENT',
          name: 'Alquiler',
          amount: '1',
          dayOfMonth: 10,
          startsOn: '2026-09',
          endsOn: '2026-08',
        }),
      ),
    ).toBe('Tiene que terminar después de empezar');
    expect(
      CreateCommitmentSchema.safeParse({
        kind: 'RENT',
        name: 'Alquiler',
        amount: '1',
        dayOfMonth: 10,
        currency: 'USD',
      }).success,
    ).toBe(false);
  });

  it('plan income cannot be negative', () => {
    expect(UpsertMonthPlanSchema.safeParse({ expectedIncome: '-1' }).success).toBe(false);
    expect(UpsertMonthPlanSchema.safeParse({ expectedIncome: '0' }).success).toBe(true);
  });
});

describe('summary schema', () => {
  it('parses what computeMonthSummary returns', () => {
    const summary = computeMonthSummary({
      month: '2026-09',
      today: { year: 2026, month: 9, day: 21 },
      plan: { expectedIncome: '1500000.00', salary: null },
      previousPlan: null,
      previousStatement: '0.00',
      commitments: [
        {
          id: uuid,
          name: 'Alquiler',
          kind: 'RENT',
          amount: '450000.00',
          currency: 'ARS',
          method: 'DEBIT',
          dayOfMonth: 10,
          startsOn: '2026-01-01',
          endsOn: null,
          installmentsTotal: null,
          active: true,
        },
      ],
      transactions: [],
    });
    expect(MonthSummarySchema.parse(summary)).toEqual(summary);
  });
});
