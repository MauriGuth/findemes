const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  aacute: 'á',
  eacute: 'é',
  iacute: 'í',
  oacute: 'ó',
  uacute: 'ú',
  ntilde: 'ñ',
  Aacute: 'Á',
  Eacute: 'É',
  Iacute: 'Í',
  Oacute: 'Ó',
  Uacute: 'Ú',
  Ntilde: 'Ñ',
  uuml: 'ü',
};

/** Enough for any bank or service email; the LLM only gets 40 000 characters anyway. */
const MAX_HTML_CHARS = 400_000;

function fromCode(code: number): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : ' ';
}

/** Drops <script>, <style> and <head> blocks with indexOf, in linear time. */
function dropBlocks(html: string): string {
  const lower = html.toLowerCase();
  let out = '';
  let i = 0;
  while (i < html.length) {
    const open = lower.indexOf('<', i);
    if (open === -1) break;
    const tag = /^<(script|style|head)\b/.exec(lower.slice(open, open + 8))?.[1];
    if (!tag) {
      out += html.slice(i, open + 1);
      i = open + 1;
      continue;
    }
    out += html.slice(i, open) + ' ';
    const close = lower.indexOf(`</${tag}`, open);
    if (close === -1) return out;
    const end = lower.indexOf('>', close);
    i = end === -1 ? html.length : end + 1;
  }
  return out + html.slice(i);
}

/**
 * Plain text from an email's HTML, for the LLM. Never renders anything, never follows
 * links or loads images: scripts, styles and tags go, line breaks stay. Linear-time
 * patterns only (the input is untrusted) and no dependency.
 */
export function htmlToText(html: string): string {
  return dropBlocks(html.slice(0, MAX_HTML_CHARS))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|table)\s*>/gi, '\n')
    .replace(/<\/t[dh]\s*>/gi, ' ')
    .replace(/<[^<>]*>/g, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/&#(\d{1,10});/g, (_, code: string) => fromCode(Number(code)))
    .replace(/&#x([0-9a-f]{1,8});/gi, (_, code: string) => fromCode(parseInt(code, 16)))
    .replace(/&([a-z]{2,8});/gi, (match, name: string) => ENTITIES[name] ?? match)
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
