import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  allocateMoney,
  type Commitment,
  type CreateCommitment,
  type CreateInstallmentPurchaseInput,
  installmentsEndsOn,
  monthKey,
  type MonthKey,
  toArtCalendarDate,
  todayInArt,
  type UpdateCommitmentInput,
} from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { dateToIso, monthKeyToDate } from '../common/dto.js';
import { type Commitment as CommitmentRow } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toCommitmentDto } from './plan.dto.js';
import { ReferencesService } from './references.service.js';

@Injectable()
export class CommitmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly refs: ReferencesService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async list(userId: string, includeInactive = false): Promise<Commitment[]> {
    const rows = await this.prisma.commitment.findMany({
      where: { userId, ...(includeInactive ? {} : { active: true }) },
      orderBy: [{ dayOfMonth: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toCommitmentDto);
  }

  async getOwned(userId: string, id: string): Promise<CommitmentRow> {
    const row = await this.prisma.commitment.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException();
    return row;
  }

  async get(userId: string, id: string): Promise<Commitment> {
    return toCommitmentDto(await this.getOwned(userId, id));
  }

  async create(userId: string, input: CreateCommitment): Promise<Commitment> {
    await Promise.all([
      this.refs.assertCategory(userId, input.categoryId),
      this.refs.assertSource(input.sourceId),
    ]);
    const startsOn: MonthKey = input.startsOn ?? monthKey(todayInArt(this.clock.now()));
    const endsOn = this.resolveEndsOn(
      input.kind,
      startsOn,
      input.installmentsTotal ?? null,
      input.endsOn ?? null,
    );
    const row = await this.prisma.commitment.create({
      data: {
        userId,
        kind: input.kind,
        name: input.name,
        amount: input.amount,
        currency: input.currency,
        method: input.method,
        dayOfMonth: input.dayOfMonth,
        installmentsTotal: input.installmentsTotal ?? null,
        startsOn: monthKeyToDate(startsOn),
        endsOn: endsOn ? monthKeyToDate(endsOn) : null,
        sourceId: input.sourceId ?? null,
        categoryId: input.categoryId ?? null,
      },
    });
    return toCommitmentDto(row);
  }

  async update(userId: string, id: string, input: UpdateCommitmentInput): Promise<Commitment> {
    const current = await this.getOwned(userId, id);
    await Promise.all([
      this.refs.assertCategory(userId, input.categoryId),
      this.refs.assertSource(input.sourceId),
    ]);

    const kind = input.kind ?? current.kind;
    const startsOn: MonthKey = input.startsOn ?? dateToIso(current.startsOn).slice(0, 7);
    const installmentsTotal =
      input.installmentsTotal !== undefined ? input.installmentsTotal : current.installmentsTotal;
    const requestedEndsOn: MonthKey | null =
      input.endsOn !== undefined
        ? input.endsOn
        : current.endsOn
          ? dateToIso(current.endsOn).slice(0, 7)
          : null;

    let active = input.active ?? current.active;
    let endsOn = this.resolveEndsOn(kind, startsOn, installmentsTotal, requestedEndsOn);
    // "Dar de baja" a commitment in the month it started: nothing to keep, pause it instead.
    if (endsOn !== null && endsOn < startsOn) {
      endsOn = null;
      active = false;
    }

    const row = await this.prisma.commitment.update({
      where: { id },
      data: {
        kind,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.amount !== undefined ? { amount: input.amount } : {}),
        ...(input.method !== undefined ? { method: input.method } : {}),
        ...(input.dayOfMonth !== undefined ? { dayOfMonth: input.dayOfMonth } : {}),
        startsOn: monthKeyToDate(startsOn),
        endsOn: endsOn ? monthKeyToDate(endsOn) : null,
        installmentsTotal,
        ...(input.sourceId !== undefined ? { sourceId: input.sourceId } : {}),
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        active,
      },
    });
    return toCommitmentDto(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.getOwned(userId, id);
    await this.prisma.commitment.delete({ where: { id } });
  }

  /** "Gasté $600.000 con tarjeta en 6 cuotas": one commitment, no purchase transaction. */
  async createInstallmentPurchase(
    userId: string,
    input: CreateInstallmentPurchaseInput,
  ): Promise<Commitment> {
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : this.clock.now();
    const purchaseDay = toArtCalendarDate(occurredAt);
    const [firstInstallment] = allocateMoney(input.total, input.installments);
    return this.create(userId, {
      kind: 'INSTALLMENT',
      name: input.name,
      amount: firstInstallment ?? input.total,
      currency: 'ARS',
      method: 'CREDIT',
      dayOfMonth: purchaseDay.day,
      startsOn: monthKey(purchaseDay),
      installmentsTotal: input.installments,
      ...(input.sourceId ? { sourceId: input.sourceId } : {}),
      ...(input.categoryId ? { categoryId: input.categoryId } : {}),
    });
  }

  /** Installments always end startsOn + total − 1 months; other kinds keep what the user said. */
  private resolveEndsOn(
    kind: string,
    startsOn: MonthKey,
    installmentsTotal: number | null,
    requested: MonthKey | null,
  ): MonthKey | null {
    if (kind === 'INSTALLMENT' && installmentsTotal !== null) {
      return installmentsEndsOn(`${startsOn}-01`, installmentsTotal).slice(0, 7);
    }
    return requested;
  }
}
