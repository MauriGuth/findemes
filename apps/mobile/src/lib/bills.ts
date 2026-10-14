import { type Bill, type BillKind } from '@findemes/shared';

export const BILL_KIND_LABEL: Record<BillKind, string> = {
  CARD_STATEMENT: 'Resumen de tarjeta',
  UTILITY: 'Servicio',
  EDUCATION: 'Educación',
  HEALTH: 'Salud',
  TAX: 'Impuesto',
  SUBSCRIPTION: 'Suscripción',
  OTHER: 'Otro',
};

export function billStatus(
  bill: Pick<Bill, 'status' | 'dueOn'>,
  todayIso: string,
): { label: string; tone: 'success' | 'warn' | 'default' } {
  if (bill.status === 'PAID') return { label: 'Pagado ✓', tone: 'success' };
  if (bill.status === 'IGNORED') return { label: 'No es mía', tone: 'default' };
  if (bill.status === 'PENDING') return { label: 'Para revisar', tone: 'warn' };
  if (bill.dueOn < todayIso) return { label: 'Vencida', tone: 'warn' };
  return { label: 'A pagar', tone: 'default' };
}

export function dueLabel(dueOn: string): string {
  return `vence el ${String(Number(dueOn.slice(8, 10)))}/${String(Number(dueOn.slice(5, 7)))}`;
}
