/**
 * One-time codes, login PINs and similar: bank apps post them as notifications, and they
 * are secrets, not money. They are dropped before being stored or sent to an LLM.
 *
 * A notification counts as one when it names a code ("código", "clave", "token", "PIN",
 * "OTP", "verificación") AND carries a standalone 4–8 digit number AND shows no amount
 * ("$", "US$"), so a payment that mentions "clave" is never dropped.
 */
const CODE_WORD =
  /\b(c[oó]digo|clave|token|pin|otp|contrase[nñ]a|verificaci[oó]n|verific[aá]|autenticaci[oó]n|ingres[aá] el)\b/iu;
const CODE_NUMBER = /(?<![\d.,$])\b\d{4,8}\b(?![.,]\d)/u;
const AMOUNT = /(US\$|U\$S|\$)\s?\d/u;

export function looksLikeSecurityCode(text: string): boolean {
  return CODE_WORD.test(text) && CODE_NUMBER.test(text) && !AMOUNT.test(text);
}
