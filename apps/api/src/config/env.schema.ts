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

  // ── inbound email (Phase 3, ADR 013) ──
  /**
   * The provider's inbound address ("abc123@inbound.postmarkapp.com"); each user gets
   * `abc123+<token>@...`. Optional: without it the email feature answers "not available".
   */
  INBOUND_EMAIL_ADDRESS: z.email().optional(),
  /** Basic-auth credentials the provider sends with every webhook. */
  INBOUND_WEBHOOK_USER: z.string().min(4).optional(),
  INBOUND_WEBHOOK_PASSWORD: Secret.optional(),
  /** Claude calls for emails per user per day (Argentina), apart from notifications. */
  EMAIL_LLM_DAILY_CAP: z.coerce.number().int().min(0).default(40),
  /** Email reading is slower (PDFs): its own timeout. */
  EMAIL_LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(90_000),

  // ── receipts and AI entries (Phase 4, ADR 014) ──
  /**
   * S3-compatible bucket for ticket photos (Cloudflare R2: https://<account>.r2.cloudflarestorage.com,
   * region "auto"). Optional: without it, tickets answer "not available".
   */
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).default('auto'),
  S3_BUCKET: z.string().min(3).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  /** Claude calls per user per day for tickets and typed or chat entries (Argentina). */
  ASSIST_LLM_DAILY_CAP: z.coerce.number().int().min(0).default(40),
  /** Reading a photo takes longer than a notification. */
  RECEIPT_LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).max(300_000).default(60_000),

  // ── chats (Phase 4, ADR 014) ──
  /** Public https base URL of this API, used to register chat webhooks. */
  API_PUBLIC_URL: z.url().optional(),
  /** From @BotFather. All three or none. */
  TELEGRAM_BOT_TOKEN: z.string().min(20).optional(),
  TELEGRAM_BOT_USERNAME: z.string().min(3).optional(),
  /** Sent back by Telegram in X-Telegram-Bot-Api-Secret-Token: `openssl rand -hex 32`. */
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .regex(/^[A-Za-z0-9_-]{32,256}$/, 'must be 32+ characters of A-Z, a-z, 0-9, _ or -')
    .optional(),
  /** WhatsApp Business Cloud API (Meta). All five or none. */
  WHATSAPP_ACCESS_TOKEN: z.string().min(20).optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().regex(/^\d+$/).optional(),
  /** App secret: verifies X-Hub-Signature-256 on every webhook. */
  WHATSAPP_APP_SECRET: z.string().min(16).optional(),
  /** Any random string, repeated in Meta's webhook setup (hub.verify_token). */
  WHATSAPP_VERIFY_TOKEN: z.string().min(16).optional(),
  /** The number as users see it, digits only with country code: "5492991234567". */
  WHATSAPP_DISPLAY_NUMBER: z
    .string()
    .regex(/^\d{8,15}$/)
    .optional(),
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
  if (env.INBOUND_EMAIL_ADDRESS && (!env.INBOUND_WEBHOOK_USER || !env.INBOUND_WEBHOOK_PASSWORD)) {
    problems.push(
      'INBOUND_WEBHOOK_USER and INBOUND_WEBHOOK_PASSWORD are required with INBOUND_EMAIL_ADDRESS',
    );
  }
  if (env.INBOUND_EMAIL_ADDRESS?.split('@')[0]?.includes('+')) {
    problems.push('INBOUND_EMAIL_ADDRESS must be the base address, without "+"');
  }
  const groups: [string, unknown[]][] = [
    [
      'S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY',
      [env.S3_ENDPOINT, env.S3_BUCKET, env.S3_ACCESS_KEY_ID, env.S3_SECRET_ACCESS_KEY],
    ],
    [
      'TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME and TELEGRAM_WEBHOOK_SECRET',
      [env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_BOT_USERNAME, env.TELEGRAM_WEBHOOK_SECRET],
    ],
    [
      'WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN and WHATSAPP_DISPLAY_NUMBER',
      [
        env.WHATSAPP_ACCESS_TOKEN,
        env.WHATSAPP_PHONE_NUMBER_ID,
        env.WHATSAPP_APP_SECRET,
        env.WHATSAPP_VERIFY_TOKEN,
        env.WHATSAPP_DISPLAY_NUMBER,
      ],
    ],
  ];
  for (const [names, values] of groups) {
    const set = values.filter((value) => value !== undefined).length;
    if (set > 0 && set < values.length) problems.push(`${names} go together: set all or none`);
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
