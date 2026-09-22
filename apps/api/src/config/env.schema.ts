import { z } from 'zod';

const NodeEnv = z.enum(['development', 'test', 'production']);
const MailProviderName = z.enum(['console', 'fake', 'resend']);

/** Secrets that ship in .env.example / the test setup. Fine locally, refused in production. */
const PLACEHOLDER_SECRET = /^(dev-only|test-only)-/;

const Secret = z.string().min(32, 'must be at least 32 characters (openssl rand -base64 48)');

export const EnvSchema = z.object({
  NODE_ENV: NodeEnv.default('development'),
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

  // ── auth ──
  JWT_SECRET: Secret,
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
  REFRESH_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** A login session never outlives this, however often it refreshes. */
  REFRESH_FAMILY_MAX_DAYS: z.coerce.number().int().min(1).max(730).default(180),
  OTP_PEPPER: Secret,
  OTP_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  /** Circuit breaker on total codes sent per day (Resend free tier sends 100/day). */
  OTP_GLOBAL_DAILY_CAP: z.coerce.number().int().min(1).default(100),

  // ── mail ──
  /** Defaults by NODE_ENV: development→console, test→fake, production→resend (required). */
  MAIL_PROVIDER: MailProviderName.optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  /** "Findemes <hola@tudominio.com>" or onboarding@resend.dev while the domain is unverified. */
  MAIL_FROM: z.string().min(3).optional(),
});

type ParsedEnv = z.output<typeof EnvSchema>;

export type Env = Omit<ParsedEnv, 'SWAGGER_ENABLED' | 'MAIL_PROVIDER'> & {
  SWAGGER_ENABLED: boolean;
  MAIL_PROVIDER: z.infer<typeof MailProviderName>;
};

const DEFAULT_MAIL_PROVIDER: Record<z.infer<typeof NodeEnv>, Env['MAIL_PROVIDER']> = {
  development: 'console',
  test: 'fake',
  production: 'resend',
};

export function validateEnv(config: Record<string, unknown>): Env {
  const result = EnvSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }
  const data = result.data;
  const env: Env = {
    ...data,
    SWAGGER_ENABLED: data.SWAGGER_ENABLED ?? data.NODE_ENV !== 'production',
    MAIL_PROVIDER: data.MAIL_PROVIDER ?? DEFAULT_MAIL_PROVIDER[data.NODE_ENV],
  };

  const problems: string[] = [];
  if (env.NODE_ENV === 'production') {
    if (env.MAIL_PROVIDER !== 'resend')
      problems.push('MAIL_PROVIDER must be "resend" in production');
    if (PLACEHOLDER_SECRET.test(env.JWT_SECRET))
      problems.push('JWT_SECRET is a placeholder; generate a real one');
    if (PLACEHOLDER_SECRET.test(env.OTP_PEPPER))
      problems.push('OTP_PEPPER is a placeholder; generate a real one');
  }
  if (
    env.NODE_ENV !== 'test' &&
    (env.JWT_SECRET.startsWith('test-only') || env.OTP_PEPPER.startsWith('test-only'))
  ) {
    problems.push('test-only secrets are only accepted when NODE_ENV=test');
  }
  if (env.MAIL_PROVIDER === 'resend' && (!env.RESEND_API_KEY || !env.MAIL_FROM)) {
    problems.push('RESEND_API_KEY and MAIL_FROM are required when MAIL_PROVIDER=resend');
  }
  if (problems.length > 0) {
    throw new Error(`Invalid environment:\n${problems.map((p) => `  → ${p}`).join('\n')}`);
  }
  return env;
}
