import { describe, expect, it } from 'vitest';

import { OtpService } from './otp.service.js';

function service(): OtpService {
  const config = {
    get: (key: string) =>
      ({ OTP_PEPPER: 'p'.repeat(40), OTP_TTL_MINUTES: 10, OTP_GLOBAL_DAILY_CAP: 100 })[key],
  };
  return new OtpService({} as never, config as never, {} as never, { now: () => new Date() });
}

describe('OtpService', () => {
  it('generates zero-padded six-digit codes', () => {
    const otp = service();
    for (let i = 0; i < 200; i += 1) {
      expect(otp.generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it('hashes deterministically with the email and the pepper', () => {
    const otp = service();
    expect(otp.hashCode('a@b.co', '123456')).toBe(otp.hashCode('a@b.co', '123456'));
    expect(otp.hashCode('a@b.co', '123456')).not.toBe(otp.hashCode('x@b.co', '123456'));
    expect(otp.hashCode('a@b.co', '123456')).not.toBe(otp.hashCode('a@b.co', '123457'));
    expect(otp.hashCode('a@b.co', '123456')).toMatch(/^[0-9a-f]{64}$/);
  });
});
