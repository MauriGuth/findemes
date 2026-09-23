import { z } from 'zod';

import { UuidSchema } from './common.js';
import { SourceKind } from './enums.js';

export const SourceSchema = z
  .object({
    id: UuidSchema,
    slug: z.string(),
    name: z.string(),
    kind: SourceKind,
    active: z.boolean(),
    /** Its notifications are read by automatic capture (the package name is verified). */
    captureEnabled: z.boolean(),
  })
  .meta({ id: 'Source' });
export type Source = z.infer<typeof SourceSchema>;

export const CategorySchema = z
  .object({
    id: UuidSchema,
    userId: UuidSchema.nullable(),
    slug: z.string(),
    name: z.string(),
    icon: z.string().nullable(),
    parentId: UuidSchema.nullable(),
    sortOrder: z.number().int(),
  })
  .meta({ id: 'Category' });
export type Category = z.infer<typeof CategorySchema>;
