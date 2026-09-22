import { type PrismaService } from '../../src/prisma/prisma.service.js';

/** Every user the e2e tests create lives in this domain, so cleanup is one query. */
export const E2E_EMAIL_DOMAIN = 'e2e.findemes.test';

let counter = 0;

/** A unique e2e email: `${tag}-${n}@e2e.findemes.test`. */
export function e2eEmail(tag: string): string {
  counter += 1;
  return `${tag}-${String(counter)}-${String(process.pid)}@${E2E_EMAIL_DOMAIN}`;
}

/**
 * Refuses to run destructive tests against anything that is not a local database,
 * unless explicitly allowed (CI service containers are localhost too).
 */
export function assertLocalDatabase(): void {
  if (process.env['E2E_ALLOW_REMOTE_DB'] === '1') return;
  const url = process.env['DATABASE_URL'] ?? '';
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    host = '';
  }
  if (!['localhost', '127.0.0.1', '::1', 'postgres'].includes(host)) {
    throw new Error(
      `Refusing to run e2e tests against "${host || 'unknown host'}". Point DATABASE_URL at a local Postgres or set E2E_ALLOW_REMOTE_DB=1.`,
    );
  }
}

/** Deletes everything the e2e tests created. Cascades from User cover the rest. */
export async function cleanupE2eData(prisma: PrismaService): Promise<void> {
  await prisma.loginCode.deleteMany({ where: { email: { endsWith: `@${E2E_EMAIL_DOMAIN}` } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${E2E_EMAIL_DOMAIN}` } } });
}
