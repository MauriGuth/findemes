import { z } from 'zod';

import { UuidSchema } from './common.js';
import { DevicePlatform } from './enums.js';
import { UserSchema } from './user.js';

/**
 * Normalizes before validating: zod's z.email() checks the format first, so
 * `z.email().trim()` would reject the trailing space mobile keyboards add.
 */
export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Ese mail es demasiado largo')
  .pipe(z.email({ error: 'Ese mail no parece válido' }));

export const LoginCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'El código tiene 6 números');

export const DeviceInfoSchema = z.strictObject({
  id: UuidSchema.optional(),
  platform: DevicePlatform,
  appVersion: z.string().max(40).optional(),
  name: z.string().max(80).optional(),
});
export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;

export const RequestLoginCodeSchema = z.strictObject({ email: EmailSchema });
export type RequestLoginCodeInput = z.input<typeof RequestLoginCodeSchema>;

export const VerifyLoginCodeSchema = z.strictObject({
  email: EmailSchema,
  code: LoginCodeSchema,
  device: DeviceInfoSchema,
});
export type VerifyLoginCodeInput = z.input<typeof VerifyLoginCodeSchema>;

export const RefreshTokenSchema = z.strictObject({
  refreshToken: z.string().min(40, 'Token inválido').max(128, 'Token inválido'),
});
export type RefreshTokenInput = z.input<typeof RefreshTokenSchema>;

export const AuthTokensSchema = z
  .object({
    accessToken: z.string(),
    accessExpiresInSeconds: z.number().int().positive(),
    refreshToken: z.string(),
  })
  .meta({ id: 'AuthTokens' });
export type AuthTokens = z.infer<typeof AuthTokensSchema>;

export const AuthSessionSchema = z
  .object({
    accessToken: z.string(),
    accessExpiresInSeconds: z.number().int().positive(),
    refreshToken: z.string(),
    deviceId: UuidSchema,
    user: UserSchema,
  })
  .meta({ id: 'AuthSession' });
export type AuthSession = z.infer<typeof AuthSessionSchema>;

export const OkSchema = z.object({ ok: z.literal(true) }).meta({ id: 'Ok' });
