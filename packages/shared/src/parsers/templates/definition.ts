import { z } from 'zod';

import { PaymentMethod, Currency, TransactionDirection } from '../../schemas/enums.js';
import { type ParserTemplateData } from '../types.js';

/** A template as it lives in the repo; the seed syncs these into `ParserTemplate` rows. */
export const ParserTemplateDefinitionSchema = z
  .strictObject({
    /** `Source.slug` it belongs to. */
    source: z.string().min(1),
    /** Stable per source; a new version is published when the pattern or fieldMap changes. */
    name: z.string().regex(/^[a-z0-9-]+$/, 'kebab-case'),
    priority: z.number().int().min(0).max(1000).default(100),
    confidence: z.number().min(0.6).max(1),
    pattern: z.string().min(1),
    fieldMap: z.strictObject({
      direction: TransactionDirection,
      method: PaymentMethod,
      currency: Currency.optional(),
      amountGroup: z.string().optional(),
      merchantGroup: z.string().optional(),
      merchantFixed: z.string().optional(),
      flags: z
        .string()
        .regex(/^[imsuy]*$/)
        .optional(),
    }),
  })
  .superRefine((value, ctx) => {
    let regex: RegExp;
    try {
      regex = new RegExp(value.pattern, value.fieldMap.flags ?? 'iu');
    } catch (error) {
      ctx.addIssue({ code: 'custom', path: ['pattern'], message: String(error) });
      return;
    }
    const amountGroup = value.fieldMap.amountGroup ?? 'amount';
    if (!regex.source.includes(`(?<${amountGroup}>`)) {
      ctx.addIssue({
        code: 'custom',
        path: ['pattern'],
        message: `missing named group "${amountGroup}"`,
      });
    }
  });
export type ParserTemplateDefinition = z.input<typeof ParserTemplateDefinitionSchema>;

/** Engine input for a code definition (tests and fixtures); rows in the DB carry real ids. */
export function definitionToTemplateData(definition: ParserTemplateDefinition): ParserTemplateData {
  const parsed = ParserTemplateDefinitionSchema.parse(definition);
  return {
    id: `${parsed.source}:${parsed.name}`,
    name: parsed.name,
    pattern: parsed.pattern,
    priority: parsed.priority,
    confidence: parsed.confidence,
    fieldMap: parsed.fieldMap,
  };
}
