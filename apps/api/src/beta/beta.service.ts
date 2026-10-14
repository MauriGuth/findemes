import { Inject, Injectable } from '@nestjs/common';
import {
  detectRecurring,
  type ExportQuery,
  formatIsoDate,
  monthKey,
  monthsBetween,
  normalizeMerchant,
  periodRange,
  type RecurringSuggestion,
  toArtCalendarDate,
  todayInArt,
} from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { toMoney } from '../common/dto.js';
import { loadPayday } from '../common/payday.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DIRECTION = { IN: 'Ingreso', OUT: 'Gasto' } as const;
const METHOD = {
  DEBIT: 'Débito',
  CREDIT: 'Crédito',
  TRANSFER: 'Transferencia',
  CASH: 'Efectivo',
  WALLET: 'Billetera',
} as const;
const STATUS = { PENDING: 'Pendiente', CONFIRMED: 'Confirmado', IGNORED: 'Ignorado' } as const;
const ORIGIN = { TEMPLATE: 'Notificación', LLM: 'Detectado con IA', MANUAL: 'A mano' } as const;
/** Longest export: two years of months. */
export const MAX_EXPORT_MONTHS = 24;

/** CSV cell for Excel in Spanish: ";" separated, quoted when needed, formulas neutralized. */
function cell(value: string | null): string {
  let text = value ?? '';
  // A cell starting with = + - @ would run as a formula in Excel (CSV injection).
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Recurring-payment suggestions and the CSV export (Phase 7, ADR 017). */
@Injectable()
export class BetaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async suggestions(userId: string): Promise<RecurringSuggestion[]> {
    const now = this.clock.now();
    const current = monthKey(todayInArt(now));
    const [user, commitments, rows] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { dismissedRecurring: true },
      }),
      this.prisma.commitment.findMany({ where: { userId }, select: { name: true } }),
      this.prisma.transaction.findMany({
        where: {
          userId,
          direction: 'OUT',
          occurredAt: { gte: new Date(now.getTime() - 130 * 86_400_000) },
        },
        select: {
          id: true,
          amount: true,
          currency: true,
          direction: true,
          method: true,
          status: true,
          isOwnTransfer: true,
          commitmentId: true,
          merchantRaw: true,
          merchantNorm: true,
          occurredAt: true,
        },
      }),
    ]);
    return detectRecurring(
      rows.map((r) => ({
        ...r,
        amount: toMoney(r.amount),
        // Manual entries have no merchantNorm: derive it from what was typed.
        merchantNorm: r.merchantNorm ?? normalizeMerchant(r.merchantRaw),
        occurredAt: r.occurredAt.toISOString(),
      })),
      {
        current,
        knownNames: commitments.flatMap((c) => normalizeMerchant(c.name) ?? []),
        dismissed: user.dismissedRecurring,
      },
    );
  }

  async dismiss(userId: string, key: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { dismissedRecurring: true },
    });
    if (user.dismissedRecurring.includes(key)) return;
    await this.prisma.user.update({
      where: { id: userId },
      data: { dismissedRecurring: [...user.dismissedRecurring, key].slice(-200) },
    });
  }

  /** Movements between two periods (inclusive), as CSV for Excel or Google Sheets. */
  async exportCsv(userId: string, query: ExportQuery): Promise<string> {
    const payday = await loadPayday(this.prisma, userId);
    const start = periodRange(query.from, payday).start;
    const end = periodRange(query.to, payday).end;
    const rows = await this.prisma.transaction.findMany({
      where: { userId, occurredAt: { gte: start, lt: end } },
      orderBy: { occurredAt: 'asc' },
      include: { category: { select: { name: true } }, source: { select: { name: true } } },
    });
    const header = [
      'Fecha',
      'Hora',
      'Tipo',
      'Monto',
      'Moneda',
      'Medio',
      'Comercio',
      'Categoría',
      'Banco o billetera',
      'Estado',
      'Origen',
      'Entre mis cuentas',
      'Nota',
    ];
    const lines = rows.map((t) => {
      const local = new Date(t.occurredAt.getTime() - 3 * 3_600_000);
      return [
        formatIsoDate(toArtCalendarDate(t.occurredAt)),
        local.toISOString().slice(11, 16),
        DIRECTION[t.direction],
        toMoney(t.amount).replace('.', ','),
        t.currency,
        METHOD[t.method],
        t.merchantRaw,
        t.category?.name ?? null,
        t.source?.name ?? null,
        STATUS[t.status],
        ORIGIN[t.origin],
        t.isOwnTransfer ? 'Sí' : 'No',
        t.note,
      ]
        .map(cell)
        .join(';');
    });
    // BOM so Excel reads the accents as UTF-8.
    return `\uFEFF${[header.join(';'), ...lines].join('\r\n')}\r\n`;
  }

  static validRange(query: ExportQuery): boolean {
    const span = monthsBetween(query.from, query.to);
    return span >= 0 && span < MAX_EXPORT_MONTHS;
  }
}
