import { createHash } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  addDays,
  type Bill,
  BILL_OVERDUE_DAYS,
  type CreateBillInput,
  CreateBillSchema,
  formatIsoDate,
  type MonthKey,
  monthKeyOfIso,
  normalizeMerchant,
  parseIsoDate,
  parseMonthKey,
  type PayBillInput,
  startOfNextMonth,
  todayInArt,
  type Transaction,
  type UpdateBillInput,
} from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { dateToIso, dateToMonthKey, isoToDate, monthKeyToDate, toMoney } from '../common/dto.js';
import { type Bill as BillRow, Prisma } from '../generated/prisma/client.js';
import { ReferencesService } from '../plans/references.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toTransactionDto, transactionInclude } from '../transactions/transaction.dto.js';
import { TransactionsService } from '../transactions/transactions.service.js';

/** Payments this far before the due date can be the one that paid it. */
const CANDIDATE_DAYS = 45;

/**
 * A PAID bill whose payment was deleted or ignored is owed again: the API reports it as
 * UNPAID everywhere, like the summary does.
 */
export function effectiveStatus(
  row: Pick<BillRow, 'status'>,
  payment: { status: string } | null | undefined,
): BillRow['status'] {
  return row.status === 'PAID' && (!payment || payment.status === 'IGNORED')
    ? 'UNPAID'
    : row.status;
}

export function toBillDto(row: BillRow, payment?: { status: string } | null): Bill {
  return {
    id: row.id,
    kind: row.kind,
    issuer: row.issuer,
    amount: toMoney(row.amount),
    minimumAmount: row.minimumAmount ? toMoney(row.minimumAmount) : null,
    currency: row.currency,
    dueOn: dateToIso(row.dueOn),
    periodMonth: row.periodMonth ? dateToMonthKey(row.periodMonth) : null,
    status: payment === undefined ? row.status : effectiveStatus(row, payment),
    origin: row.origin,
    commitmentId: row.commitmentId,
    paidTransactionId: row.paidTransactionId,
    createdAt: row.createdAt.toISOString(),
  };
}

function fingerprint(
  userId: string,
  kind: string,
  issuerNorm: string,
  amount: string,
  dueOn: string,
): string {
  return createHash('sha256')
    .update([userId, kind, issuerNorm, amount, dueOn].join('|'))
    .digest('hex');
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

const DUPLICATE = 'Ya tenés esa factura cargada.';

/** "Por pagar" (ADR 013): bills read from email or loaded by hand, and their payments. */
@Injectable()
export class BillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refs: ReferencesService,
    private readonly transactions: TransactionsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async owned(userId: string, id: string): Promise<BillRow> {
    const bill = await this.prisma.bill.findFirst({ where: { id, userId } });
    if (!bill) throw new NotFoundException();
    return bill;
  }

  /** Due in the month (default: current) plus unpaid ones overdue up to BILL_OVERDUE_DAYS. */
  async list(userId: string, month?: MonthKey): Promise<Bill[]> {
    const first = month
      ? parseMonthKey(month)
      : parseMonthKey(monthKeyOfIso(formatIsoDate(todayInArt(this.clock.now()))));
    const start = isoToDate(formatIsoDate(first));
    const rows = await this.prisma.bill.findMany({
      where: {
        userId,
        OR: [
          { dueOn: { gte: start, lt: isoToDate(formatIsoDate(startOfNextMonth(first))) } },
          {
            status: { in: ['PENDING', 'UNPAID'] },
            dueOn: { gte: isoToDate(formatIsoDate(addDays(first, -BILL_OVERDUE_DAYS))), lt: start },
          },
        ],
      },
      orderBy: [{ dueOn: 'asc' }, { createdAt: 'asc' }],
      include: { paidTransaction: { select: { status: true } } },
    });
    return rows.map((row) => toBillDto(row, row.paidTransaction));
  }

  async create(userId: string, input: CreateBillInput): Promise<Bill> {
    const data = CreateBillSchema.parse(input);
    await this.refs.assertCommitment(userId, data.commitmentId ?? undefined);
    const issuerNorm = normalizeMerchant(data.issuer) ?? data.issuer.toUpperCase();
    try {
      const row = await this.prisma.bill.create({
        data: {
          userId,
          kind: data.kind,
          issuer: data.issuer,
          issuerNorm,
          amount: new Prisma.Decimal(data.amount),
          minimumAmount: data.minimumAmount ? new Prisma.Decimal(data.minimumAmount) : null,
          currency: data.currency,
          dueOn: isoToDate(data.dueOn),
          status: 'UNPAID',
          origin: 'MANUAL',
          fingerprint: fingerprint(
            userId,
            data.kind,
            issuerNorm,
            toMoney(new Prisma.Decimal(data.amount)),
            data.dueOn,
          ),
          commitmentId: data.commitmentId ?? null,
        },
      });
      return toBillDto(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException({ message: DUPLICATE });
      throw error;
    }
  }

  async update(userId: string, id: string, input: UpdateBillInput): Promise<Bill> {
    const bill = await this.owned(userId, id);
    if (input.commitmentId) await this.refs.assertCommitment(userId, input.commitmentId);
    if (bill.status === 'PAID' && input.status) {
      throw new ConflictException({ message: 'Esa factura ya figura pagada.' });
    }
    const kind = input.kind ?? bill.kind;
    const issuer = input.issuer ?? bill.issuer;
    const issuerNorm = normalizeMerchant(issuer) ?? issuer.toUpperCase();
    const amount = input.amount ? new Prisma.Decimal(input.amount) : bill.amount;
    const dueOn = input.dueOn ?? dateToIso(bill.dueOn);
    try {
      const row = await this.prisma.bill.update({
        where: { id },
        data: {
          kind,
          issuer,
          issuerNorm,
          amount,
          ...(input.minimumAmount !== undefined
            ? {
                minimumAmount: input.minimumAmount ? new Prisma.Decimal(input.minimumAmount) : null,
              }
            : {}),
          dueOn: isoToDate(dueOn),
          ...(input.status ? { status: input.status } : {}),
          ...(input.commitmentId !== undefined ? { commitmentId: input.commitmentId } : {}),
          fingerprint: fingerprint(userId, kind, issuerNorm, toMoney(amount), dueOn),
        },
      });
      return toBillDto(row);
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException({ message: DUPLICATE });
      throw error;
    }
  }

  /** Movements that could be the payment of this bill, newest first. */
  async candidates(userId: string, id: string): Promise<Transaction[]> {
    const bill = await this.owned(userId, id);
    const due = parseIsoDate(dateToIso(bill.dueOn));
    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        direction: 'OUT',
        currency: bill.currency,
        status: { not: 'IGNORED' },
        isOwnTransfer: false,
        paidBill: null,
        isStatementPayment: false,
        OR: [
          { commitmentId: null },
          ...(bill.commitmentId && bill.kind !== 'CARD_STATEMENT'
            ? [
                {
                  commitmentId: bill.commitmentId,
                  commitmentMonth: isoToDate(`${monthKeyOfIso(dateToIso(bill.dueOn))}-01`),
                },
              ]
            : []),
        ],
        ...(bill.kind === 'CARD_STATEMENT' ? { method: { not: 'CREDIT' } } : {}),
        amount: {
          gte: bill.amount.minus(1),
          lte: bill.amount.plus(1),
        },
        occurredAt: {
          gte: isoToDate(formatIsoDate(addDays(due, -CANDIDATE_DAYS))),
          lte: this.clock.now(),
        },
      },
      orderBy: { occurredAt: 'desc' },
      take: 10,
      include: transactionInclude,
    });
    return rows.map(toTransactionDto);
  }

  /**
   * "Pagué": links the movement that paid it, or records a new payment. A card statement's
   * payment is a statement payment; a bill that prices a commitment pays that commitment's
   * month, so the formula counts it exactly once (ADR 007, ADR 013).
   */
  async pay(userId: string, id: string, input: PayBillInput): Promise<Bill> {
    const bill = await this.prisma.bill.findFirst({
      where: { id, userId },
      include: { paidTransaction: { select: { status: true } } },
    });
    if (!bill) throw new NotFoundException();
    const stillPaid =
      bill.status === 'PAID' && bill.paidTransaction && bill.paidTransaction.status !== 'IGNORED';
    if (stillPaid) throw new ConflictException({ message: 'Esa factura ya figura pagada.' });
    if (bill.status === 'IGNORED') {
      throw new ConflictException({ message: 'Marcaste esa factura como que no es tuya.' });
    }

    const statement = bill.kind === 'CARD_STATEMENT';
    const commitmentMonth =
      bill.commitmentId && !statement ? monthKeyOfIso(dateToIso(bill.dueOn)) : null;
    let transactionId: string;

    if (input.transactionId) {
      const tx = await this.prisma.transaction.findFirst({
        where: { id: input.transactionId, userId },
        include: { paidBill: { select: { id: true } } },
      });
      if (!tx) throw new NotFoundException();
      if (tx.paidBill) {
        throw new ConflictException({ message: 'Ese movimiento ya pagó otra factura.' });
      }
      const otherDebt =
        tx.isStatementPayment ||
        (tx.commitmentId !== null &&
          !(
            commitmentMonth &&
            tx.commitmentId === bill.commitmentId &&
            tx.commitmentMonth?.getTime() === monthKeyToDate(commitmentMonth).getTime()
          ));
      if (tx.direction !== 'OUT' || tx.status === 'IGNORED' || tx.isOwnTransfer || otherDebt) {
        throw new BadRequestException({ message: 'Ese movimiento no puede ser el pago.' });
      }
      if (statement && tx.method === 'CREDIT') {
        throw new BadRequestException({ message: 'El resumen no se paga con la misma tarjeta.' });
      }
      // The status stays as it is: a movement still in review keeps its question in Pendientes.
      await this.prisma.transaction.update({
        where: { id: tx.id },
        data: {
          ...(statement ? { isStatementPayment: true } : {}),
          ...(commitmentMonth
            ? { commitmentId: bill.commitmentId, commitmentMonth: monthKeyToDate(commitmentMonth) }
            : {}),
        },
      });
      transactionId = tx.id;
    } else {
      const method = input.method ?? 'DEBIT';
      if (statement && method === 'CREDIT') {
        throw new BadRequestException({ message: 'El resumen no se paga con la misma tarjeta.' });
      }
      let amount = input.amount ?? toMoney(bill.amount);
      if (commitmentMonth && bill.commitmentId) {
        // Whatever the commitment's own "Pagué" already paid this month counts.
        const paid = await this.prisma.transaction.findMany({
          where: {
            userId,
            commitmentId: bill.commitmentId,
            commitmentMonth: monthKeyToDate(commitmentMonth),
            status: { not: 'IGNORED' },
            isOwnTransfer: false,
          },
          orderBy: { occurredAt: 'desc' },
          select: { id: true, amount: true, paidBill: { select: { id: true } } },
        });
        const paidSoFar = paid.reduce((sum, p) => sum.plus(p.amount), new Prisma.Decimal(0));
        const remainder = bill.amount.minus(paidSoFar);
        const latest = paid.find((p) => !p.paidBill);
        if (remainder.lte(0) && latest) {
          const row = await this.prisma.bill.update({
            where: { id },
            data: { status: 'PAID', paidTransactionId: latest.id },
          });
          return toBillDto(row);
        }
        if (!input.amount && remainder.gt(0)) amount = toMoney(remainder);
      }
      const created = await this.transactions.create(userId, {
        amount,
        currency: bill.currency,
        direction: 'OUT',
        method,
        merchantRaw: bill.issuer,
        occurredAt: input.occurredAt ?? this.clock.now().toISOString(),
        status: 'CONFIRMED',
        isOwnTransfer: false,
        isStatementPayment: statement,
        markAsSalary: false,
        ...(commitmentMonth && bill.commitmentId
          ? { commitmentId: bill.commitmentId, commitmentMonth }
          : {}),
      });
      transactionId = created.id;
    }

    const row = await this.prisma.bill.update({
      where: { id },
      data: { status: 'PAID', paidTransactionId: transactionId },
    });
    return toBillDto(row);
  }
}
