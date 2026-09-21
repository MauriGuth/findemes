import { z } from 'zod';

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .regex(/^postgres(ql)?:\/\//, 'DATABASE_URL must be a postgresql:// connection string'),
  /** Comma-separated browser origins. Empty disables CORS (the mobile app does not need it). */
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin !== ''),
    ),
  /** Defaults to true outside production. */
  SWAGGER_ENABLED: z.stringbool().optional(),
});

export type Env = z.output<typeof EnvSchema> & { SWAGGER_ENABLED: boolean };

export function validateEnv(config: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  return {
    ...result.data,
    SWAGGER_ENABLED: result.data.SWAGGER_ENABLED ?? result.data.NODE_ENV !== 'production',
  };
}
