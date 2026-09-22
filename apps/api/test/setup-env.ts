import { config } from 'dotenv';

// Runs before every e2e file. Fixes the test environment before apps/api/.env is
// read, so a developer's .env (NODE_ENV=development, MAIL_PROVIDER=console) never
// leaks into the tests. Variables already present in the shell (CI) still win.
process.env['NODE_ENV'] = 'test';
process.env['MAIL_PROVIDER'] ??= 'fake';
process.env['JWT_SECRET'] ??= 'test-only-jwt-secret-test-only-jwt-secret-000000';
process.env['OTP_PEPPER'] ??= 'test-only-otp-pepper-test-only-otp-pepper-000000';
process.env['SWAGGER_ENABLED'] ??= 'false';

config();
