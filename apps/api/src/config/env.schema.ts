import { z } from 'zod';

const NodeEnv = z.enum(['development', 'test', 'production']);
const MailProviderName = z.enum(['console', 'fake', 'resend']);
const LlmProviderName = z.enum(['anthropic', 'fake', 'none']);

/** Keys that ship in .env.example / the test setup; refused in production. */
export const DEV_RAW_EVENT_KEY = Buffer.from('dev-only-raw-event-key-000000000').toString('base64');
export const TEST_RAW_EVENT_KEY = Buffer.from('test-only-raw-event-key-00000000').toString(
  'base64',
);

/** base64 of exactly 32 random bytes (AES-256): `openssl rand -base64 32`. */
const AesKey = z.string().refine((value) => Buffer.from(value, 'base64').length === 32, {
  message: 'must be base64 of 32 bytes (openssl rand -base64 32)',
});

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

  // ── ingest (Phase 2) ──
  /**
   * AES-256-GCM key for RawEvent payloads. Optional so a deploy never breaks before it
   * is configured: without it, automatic capture answers 503 and nothing is stored.
   */
  RAW_EVENT_KEY: AesKey.optional(),
  /** Bumped when RAW_EVENT_KEY is rotated; stored with each event. */
  RAW_EVENT_KEY_VERSION: z.coerce.number().int().min(1).default(1),
  /** Days before the app replaces a device's ingest token when it opens. */
  INGEST_TOKEN_ROTATE_DAYS: z.coerce.number().int().min(1).max(365).default(30),

  // ── LLM fallback ──
  /** Defaults: test→fake; otherwise anthropic when ANTHROPIC_API_KEY is set, else none. */
  LLM_PROVIDER: LlmProviderName.optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  LLM_MODEL: z.string().min(1).default('claude-opus-5'),
  /** Claude calls per user per day (Argentina); beyond it, unmatched notifications wait. */
  LLM_DAILY_CAP: z.coerce.number().int().min(0).default(30),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(15_000),
});

type ParsedEnv = z.output<typeof EnvSchema>;

export type Env = Omit<ParsedEnv, 'SWAGGER_ENABLED' | 'MAIL_PROVIDER' | 'LLM_PROVIDER'> & {
  SWAGGER_ENABLED: boolean;
  MAIL_PROVIDER: z.infer<typeof MailProviderName>;
  LLM_PROVIDER: z.infer<typeof LlmProviderName>;
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
    LLM_PROVIDER:
      data.LLM_PROVIDER ??
      (data.NODE_ENV === 'test' ? 'fake' : data.ANTHROPIC_API_KEY ? 'anthropic' : 'none'),
  };

  const problems: string[] = [];
  if (env.NODE_ENV === 'production') {
    if (env.MAIL_PROVIDER !== 'resend')
      problems.push('MAIL_PROVIDER must be "resend" in production');
    if (PLACEHOLDER_SECRET.test(env.JWT_SECRET))
      problems.push('JWT_SECRET is a placeholder; generate a real one');
    if (PLACEHOLDER_SECRET.test(env.OTP_PEPPER))
      problems.push('OTP_PEPPER is a placeholder; generate a real one');
    if (env.RAW_EVENT_KEY === DEV_RAW_EVENT_KEY || env.RAW_EVENT_KEY === TEST_RAW_EVENT_KEY)
      problems.push('RAW_EVENT_KEY is a placeholder; generate a real one');
    if (env.LLM_PROVIDER === 'fake') problems.push('LLM_PROVIDER cannot be "fake" in production');
  }
  if (env.NODE_ENV !== 'test' && env.RAW_EVENT_KEY === TEST_RAW_EVENT_KEY) {
    problems.push('the test-only RAW_EVENT_KEY is only accepted when NODE_ENV=test');
  }
  if (env.LLM_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
    problems.push('ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic');
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
