import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  budgetAlertLevel,
  computeBudgets,
  formatArs,
  periodKeyOfInstant,
  periodRange,
} from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { toMoney } from '../common/dto.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PUSH_SENDER, type PushMessage, type PushSender } from './push.sender.js';

/**
 * Server push alerts (Phase 5, ADR 015): a movement detected without opening the app, an
 * income to classify, a budget at 80% or 100%. Off with User.pushAlerts. Bill reminders stay
 * local (ADR 013). Runs in the background; never fails the request that triggered it.
 * Logs carry ids and kinds, never amounts or merchants.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);
  private readonly inflight = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PUSH_SENDER) private readonly sender: PushSender | null,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Tests and shutdown. */
  async drain(): Promise<void> {
    while (this.inflight.size > 0) await Promise.allSettled([...this.inflight]);
  }

  private track(work: () => Promise<void>): void {
    const promise = work()
      .catch(() => this.logger.warn('push.failed'))
      .finally(() => this.inflight.delete(promise));
    this.inflight.add(promise);
  }

  /** Saves (or clears) the Expo push token of a device. */
  async setToken(deviceId: string, token: string | null): Promise<void> {
    if (token) {
      // A token belongs to one phone: if another account had it (logout + login), move it.
      await this.prisma.device.updateMany({
        where: { pushToken: token, NOT: { id: deviceId } },
        data: { pushToken: null },
      });
    }
    await this.prisma.device.update({ where: { id: deviceId }, data: { pushToken: token } });
  }

  private async send(userId: string, message: Omit<PushMessage, 'to'>, kind: string) {
    if (!this.sender) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { pushAlerts: true, devices: { where: { pushToken: { not: null } } } },
    });
    if (!user?.pushAlerts) return;
    const devices = user.devices.filter((d) => d.pushToken);
    if (devices.length === 0) return;
    const tickets = await this.sender.send(
      devices.map((d) => ({ ...message, to: d.pushToken ?? '' })),
    );
    const gone = devices.filter((_, i) => {
      const ticket = tickets[i];
      return ticket && !ticket.ok && ticket.unregistered;
    });
    if (gone.length > 0) {
      await this.prisma.device.updateMany({
        where: { id: { in: gone.map((d) => d.id) } },
        data: { pushToken: null },
      });
    }
    this.logger.log(`push.sent kind=${kind} devices=${String(devices.length)}`);
  }

  /** A movement that arrived by itself (notification, email). */
  movementDetected(userId: string, transactionId: string): void {
    this.track(async () => {
      const tx = await this.prisma.transaction.findFirst({
        where: { id: transactionId, userId },
        select: {
          amount: true,
          currency: true,
          direction: true,
          status: true,
          merchantRaw: true,
          categoryId: true,
        },
      });
      if (!tx) return;
      const amount = formatArs(toMoney(tx.amount)).replace(
        '$',
        tx.currency === 'USD' ? 'US$' : '$',
      );
      if (tx.direction === 'IN') {
        await this.send(
          userId,
          {
            title: `Te entraron ${amount}`,
            body: '¿Es tu sueldo? Contanos qué es en Pendientes.',
            data: { url: '/(app)/pending' },
          },
          'income',
        );
        return;
      }
      await this.send(
        userId,
        {
          title: `Gastaste ${amount}${tx.merchantRaw ? ` en ${tx.merchantRaw}` : ''}`,
          body:
            tx.status === 'PENDING'
              ? 'Confirmalo en Pendientes.'
              : 'Ya lo restamos de lo que te queda.',
          data: { url: tx.status === 'PENDING' ? '/(app)/pending' : '/(app)/(tabs)' },
        },
        'movement',
      );
      if (tx.categoryId) await this.budgetCheck(userId, tx.categoryId);
    });
  }

  /** After a movement got (or changed) its category: did its budget cross 80% or 100%? */
  categoryTouched(userId: string, categoryId: string | null | undefined): void {
    if (!categoryId) return;
    this.track(() => this.budgetCheck(userId, categoryId));
  }

  private async budgetCheck(userId: string, categoryId: string): Promise<void> {
    const budget = await this.prisma.budget.findUnique({
      where: { userId_categoryId: { userId, categoryId } },
      include: { category: { select: { name: true } }, user: { select: { payday: true } } },
    });
    if (!budget) return;
    const month = periodKeyOfInstant(this.clock.now(), budget.user.payday);
    const { start, end } = periodRange(month, budget.user.payday);
    const rows = await this.prisma.transaction.findMany({
      where: { userId, categoryId, occurredAt: { gte: start, lt: end } },
      select: {
        amount: true,
        currency: true,
        direction: true,
        status: true,
        isOwnTransfer: true,
        isStatementPayment: true,
        categoryId: true,
        occurredAt: true,
      },
    });
    const [status] = computeBudgets(
      [{ id: budget.id, categoryId, amount: toMoney(budget.amount) }],
      rows.map((r) => ({
        ...r,
        amount: toMoney(r.amount),
        occurredAt: r.occurredAt.toISOString(),
      })),
    );
    if (!status) return;
    const level = budgetAlertLevel(status);
    const already = budget.alertedMonth === month ? budget.alertedLevel : 0;
    if (level <= already) return;
    await this.prisma.budget.update({
      where: { id: budget.id },
      data: { alertedMonth: month, alertedLevel: level },
    });
    await this.send(
      userId,
      level >= 100
        ? {
            title: `Te pasaste del presupuesto de ${budget.category.name}`,
            body: `Llevás ${formatArs(status.spent, { cents: false })} de ${formatArs(status.amount, { cents: false })}.`,
            data: { url: '/(app)/budgets' },
          }
        : {
            title: `Usaste el ${String(level)}% de ${budget.category.name}`,
            body: `Te quedan ${formatArs(status.remaining, { cents: false })} para este mes.`,
            data: { url: '/(app)/budgets' },
          },
      `budget_${String(level)}`,
    );
  }
}
