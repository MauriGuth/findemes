const LEGAL_SUFFIXES = /\b(S\.?\s?A\.?\s?S?|S\.?\s?R\.?\s?L|S\.?\s?A\.?\s?U|S\.?\s?C\.?\s?A)\.?$/u;
const BRANCH_SUFFIX = /\s+(?:SUC(?:URSAL)?\.?|N[°º]|#)\s*\d+$/u;
const TRAILING_NUMBER = /\s+\d{2,}$/u;

/**
 * A stable merchant key for dedup and, later, categorization: "Café Martínez Suc. 12"
 * and "CAFE MARTINEZ" become "CAFE MARTINEZ". Returns null when nothing is left.
 */
export function normalizeMerchant(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^\p{L}\p{N}&#°º. ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Suffixes can stack ("... S.R.L. SUC 4"): strip until stable.
  for (let previous = ''; previous !== value;) {
    previous = value;
    value = value
      .replace(BRANCH_SUFFIX, '')
      .replace(TRAILING_NUMBER, '')
      .replace(LEGAL_SUFFIXES, '')
      .replace(/[.\s]+$/u, '')
      .trim();
  }
  value = value.replace(/\./g, '').replace(/\s+/g, ' ').trim();
  return value === '' ? null : value.slice(0, 200);
}
