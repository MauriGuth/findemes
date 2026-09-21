import { describe, expect, it } from 'vitest';

import { validateEnv } from './env.schema.js';

const DATABASE_URL = 'postgresql://findemes:findemes@localhost:5432/findemes';

describe('validateEnv', () => {
  it('applies defaults', () => {
    const env = validateEnv({ DATABASE_URL });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.SWAGGER_ENABLED).toBe(true);
  });

  it('disables swagger in production unless asked', () => {
    expect(validateEnv({ DATABASE_URL, NODE_ENV: 'production' }).SWAGGER_ENABLED).toBe(false);
    expect(
      validateEnv({ DATABASE_URL, NODE_ENV: 'production', SWAGGER_ENABLED: 'true' })
        .SWAGGER_ENABLED,
    ).toBe(true);
  });

  it('parses PORT and CORS_ORIGINS', () => {
    const env = validateEnv({
      DATABASE_URL,
      PORT: '8080',
      CORS_ORIGINS: 'https://a.com, https://b.com,',
    });
    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGINS).toEqual(['https://a.com', 'https://b.com']);
  });

  it('refuses to start without a Postgres URL', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
    expect(() => validateEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/postgresql/);
  });
});
