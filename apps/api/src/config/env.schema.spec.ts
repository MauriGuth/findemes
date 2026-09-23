import { describe, expect, it } from 'vitest';

import { DEV_RAW_EVENT_KEY, TEST_RAW_EVENT_KEY, validateEnv } from './env.schema.js';

const DATABASE_URL = 'postgresql://findemes:findemes@localhost:5432/findemes';
const secret = 'x'.repeat(48);
const base = { DATABASE_URL, JWT_SECRET: secret, OTP_PEPPER: secret };

describe('validateEnv', () => {
  it('applies defaults', () => {
    const env = validateEnv(base);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.SWAGGER_ENABLED).toBe(true);
    expect(env.MAIL_PROVIDER).toBe('console');
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TTL_DAYS).toBe(30);
    expect(env.REFRESH_FAMILY_MAX_DAYS).toBe(180);
    expect(env.OTP_TTL_MINUTES).toBe(10);
    expect(env.OTP_GLOBAL_DAILY_CAP).toBe(100);
  });

  it('picks the mail provider by NODE_ENV', () => {
    expect(validateEnv({ ...base, NODE_ENV: 'test' }).MAIL_PROVIDER).toBe('fake');
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /RESEND_API_KEY and MAIL_FROM/,
    );
    expect(
      validateEnv({ ...base, NODE_ENV: 'production', RESEND_API_KEY: 're_x', MAIL_FROM: 'a@b.co' })
        .MAIL_PROVIDER,
    ).toBe('resend');
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        MAIL_PROVIDER: 'console',
        RESEND_API_KEY: 're_x',
        MAIL_FROM: 'a@b.co',
      }),
    ).toThrow(/must be "resend" in production/);
    expect(() => validateEnv({ ...base, MAIL_PROVIDER: 'resend' })).toThrow(/RESEND_API_KEY/);
  });

  it('disables swagger in production unless asked', () => {
    const prod = { ...base, NODE_ENV: 'production', RESEND_API_KEY: 're_x', MAIL_FROM: 'a@b.co' };
    expect(validateEnv(prod).SWAGGER_ENABLED).toBe(false);
    expect(validateEnv({ ...prod, SWAGGER_ENABLED: 'true' }).SWAGGER_ENABLED).toBe(true);
  });

  it('parses PORT and CORS_ORIGINS', () => {
    const env = validateEnv({
      ...base,
      PORT: '8080',
      CORS_ORIGINS: 'https://a.com, https://b.com,',
    });
    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGINS).toEqual(['https://a.com', 'https://b.com']);
  });

  it('refuses short secrets, placeholders in production and test secrets outside test', () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...base, OTP_PEPPER: 'short' })).toThrow(/OTP_PEPPER/);
    const placeholder = `dev-only-${'x'.repeat(40)}`;
    expect(validateEnv({ ...base, JWT_SECRET: placeholder }).JWT_SECRET).toBe(placeholder);
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_SECRET: placeholder,
        RESEND_API_KEY: 're_x',
        MAIL_FROM: 'a@b.co',
      }),
    ).toThrow(/placeholder/);
    const testSecret = `test-only-${'x'.repeat(40)}`;
    expect(
      validateEnv({ ...base, NODE_ENV: 'test', JWT_SECRET: testSecret, OTP_PEPPER: testSecret })
        .NODE_ENV,
    ).toBe('test');
    expect(() => validateEnv({ ...base, JWT_SECRET: testSecret })).toThrow(/test-only/);
  });

  it('refuses to start without a Postgres URL', () => {
    expect(() => validateEnv({ JWT_SECRET: secret, OTP_PEPPER: secret })).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ ...base, DATABASE_URL: 'mysql://x' })).toThrow(/postgresql/);
  });

  it('ingest and LLM settings degrade instead of breaking the boot', () => {
    const prod = { ...base, NODE_ENV: 'production', RESEND_API_KEY: 're_x', MAIL_FROM: 'a@b.co' };
    const env = validateEnv(prod);
    expect(env.RAW_EVENT_KEY).toBeUndefined();
    expect(env.LLM_PROVIDER).toBe('none');
    expect(validateEnv({ ...prod, ANTHROPIC_API_KEY: 'sk-ant-x' }).LLM_PROVIDER).toBe('anthropic');
    expect(env.LLM_MODEL).toBe('claude-opus-5');
    expect(env.LLM_DAILY_CAP).toBe(30);
    expect(validateEnv({ ...base, NODE_ENV: 'test' }).LLM_PROVIDER).toBe('fake');
  });

  it('validates RAW_EVENT_KEY and refuses placeholders in production', () => {
    const prod = { ...base, NODE_ENV: 'production', RESEND_API_KEY: 're_x', MAIL_FROM: 'a@b.co' };
    expect(() => validateEnv({ ...base, RAW_EVENT_KEY: 'short' })).toThrow(/32 bytes/);
    expect(() => validateEnv({ ...prod, RAW_EVENT_KEY: DEV_RAW_EVENT_KEY })).toThrow(/placeholder/);
    expect(() => validateEnv({ ...base, RAW_EVENT_KEY: TEST_RAW_EVENT_KEY })).toThrow(/test-only/);
    const real = Buffer.alloc(32, 7).toString('base64');
    expect(validateEnv({ ...prod, RAW_EVENT_KEY: real }).RAW_EVENT_KEY).toBe(real);
  });

  it('requires the Anthropic key when the provider is forced', () => {
    expect(() => validateEnv({ ...base, LLM_PROVIDER: 'anthropic' })).toThrow(/ANTHROPIC_API_KEY/);
  });
});
