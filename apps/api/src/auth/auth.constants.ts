export const IS_PUBLIC_KEY = 'findemes:isPublic';
export const JWT_ISSUER = 'findemes-api';
export const JWT_AUDIENCE = 'findemes-mobile';

export const OTP_LENGTH = 6;
export const OTP_MAX_ATTEMPTS_PER_CODE = 5;
export const OTP_MAX_LIVE_CODES_PER_EMAIL = 3;
export const OTP_MAX_FAILED_PER_EMAIL_PER_DAY = 20;
export const OTP_MAX_SENDS_PER_EMAIL_PER_HOUR = 5;
export const OTP_MAX_SENDS_PER_EMAIL_PER_DAY = 10;

/** A refresh token presented again this soon after rotation is a retry, not theft. */
export const REFRESH_REUSE_GRACE_MS = 60_000;

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
