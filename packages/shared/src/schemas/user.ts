import { z } from 'zod';

import { IsoDateTimeSchema, UuidSchema } from './common.js';

/** "HH:MM" in Argentina time. */
export const ReminderTimeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora tiene que ser HH:MM');

export const UserSchema = z
  .object({
    id: UuidSchema,
    email: z.string(),
    name: z.string().nullable(),
    dailyReminderTime: ReminderTimeSchema.nullable(),
    createdAt: IsoDateTimeSchema,
  })
  .meta({ id: 'User' });
export type User = z.infer<typeof UserSchema>;

export const UpdateUserSchema = z
  .strictObject({
    name: z
      .string()
      .trim()
      .min(1, 'Ponele un nombre')
      .max(80, 'El nombre es demasiado largo')
      .nullable()
      .optional(),
    dailyReminderTime: ReminderTimeSchema.nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { error: 'No hay nada para cambiar' });
export type UpdateUserInput = z.input<typeof UpdateUserSchema>;
