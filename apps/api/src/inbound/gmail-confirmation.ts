/**
 * Gmail asks to confirm a forwarding address by mailing it a code and a link. We show
 * them in the app so the user can finish the setup without finding that email (ADR 013).
 * Only the sender domain is checked strictly; the code and link are best-effort, and the
 * app falls back to "abrí el correo de Google" when neither is found.
 */
export interface GmailConfirmation {
  code: string | null;
  link: string | null;
}

export function isGmailForwardingConfirmation(from: string, subject: string): boolean {
  const sender = /<([^>]+)>/.exec(from)?.[1] ?? from;
  return (
    /@google\.com$/i.test(sender.trim()) && /(forwarding|reenv[ií]o)/i.test(`${sender} ${subject}`)
  );
}

export function extractGmailConfirmation(text: string): GmailConfirmation {
  const link =
    /https:\/\/(?:mail-settings\.google\.com|mail\.google\.com)\/\S+/i.exec(text)?.[0] ?? null;
  const code =
    /(?:c[oó]digo|code)[^\d]{0,40}(\d{6,12})/i.exec(text)?.[1] ??
    /\b(\d{9})\b/.exec(text)?.[1] ??
    null;
  return { code, link: link?.replace(/[)>\].,]+$/, '') ?? null };
}
