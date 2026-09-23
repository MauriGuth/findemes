/**
 * First pass at anonymizing a captured notification before Mauricio shares it as a
 * fixture (CLAUDE.md: amounts and merchants stay; names of people, CBU/CVU, aliases and
 * account numbers never; last 4 digits masked). Always reviewed and edited by hand after:
 * this only removes the obvious.
 */
export function maskNotificationText(text: string): string {
  return (
    text
      // CUIT/CUIL first, so the account rule below does not swallow it.
      .replace(/\b\d{2}-\d{8}-\d\b/g, '[CUIT]')
      // CBU / CVU (22 digits, maybe spaced) and any long account-like number.
      .replace(/\b\d(?:[\s-]?\d){9,}\b/g, '[CUENTA]')
      // Card or account endings: "****1234", "terminada en 1234", "x1234".
      .replace(/\*{2,}\d{3,4}\b/g, '****')
      .replace(/(\bx|terminad[ao] en\s?)\d{3,4}\b/giu, '$1****')
      // DNI with dots, when not an amount ($ or US$ right before).
      .replace(/(?<![$\d.,]\s?)\b\d{1,2}\.\d{3}\.\d{3}\b/g, '[DNI]')
      // Aliases: three or more dot-separated words ("pepe.gomez.mp").
      .replace(/\b[a-z0-9]+(?:\.[a-z0-9]+){2,}\b/giu, (match) =>
        /^\d+(\.\d+)*$/.test(match) ? match : '[ALIAS]',
      )
      // Person names after the usual prepositions: "de Juan Pérez", "a María López".
      .replace(
        /\b(de|a|para|desde)\s+((?:\p{Lu}[\p{Ll}\p{Lu}'’-]+)(?:\s+\p{Lu}[\p{Ll}\p{Lu}'’-]+){1,3})/gu,
        '$1 [NOMBRE]',
      )
  );
}
