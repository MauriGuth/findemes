import { type ParserTemplateDefinition } from './definition.js';

/**
 * Every template in the repo, by source. Each one enters with real fixtures under
 * `src/parsers/__fixtures__/<source>/` (CLAUDE.md: never invent a bank notification).
 * Empty until the first real samples arrive.
 */
export const TEMPLATE_DEFINITIONS: readonly ParserTemplateDefinition[] = [];

export * from './definition.js';
