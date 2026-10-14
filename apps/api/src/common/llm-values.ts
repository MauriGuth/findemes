import { Prisma } from '../generated/prisma/client.js';

const AMOUNT = /^\d{1,15}(\.\d{1,2})?$/;
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const LOCAL_DATE_TIME = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(:\d{2})?$/;

/** A real calendar date ("2026-02-29" is not). */
export function validDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** A positive amount Claude wrote as "1234.56", normalized to two decimals; else null. */
export function llmMoney(value: string | null | undefined): string | null {
  if (!value || !AMOUNT.test(value.trim())) return null;
  return Number(value) > 0 ? new Prisma.Decimal(value.trim()).toFixed(2) : null;
}

/**
 * "YYYY-MM-DD" (noon) or "YYYY-MM-DDTHH:MM" read as Argentina time, or a full ISO instant.
 * null when it does not parse.
 */
export function llmInstant(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (ISO_DATE.test(trimmed)) {
    return validDate(trimmed) ? new Date(`${trimmed}T12:00:00-03:00`) : null;
  }
  const local = LOCAL_DATE_TIME.exec(trimmed);
  if (local) {
    const [, day, hh, mm] = local;
    if (!day || !validDate(day) || Number(hh) > 23 || Number(mm) > 59) return null;
    return new Date(`${day}T${hh ?? '00'}:${mm ?? '00'}:00-03:00`);
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
