import { TokenService } from '../../src/auth/token.service.js';
import { type TestApp } from './app.js';
import { e2eEmail } from './db.js';

export interface TestSession {
  userId: string;
  deviceId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  /** Spread into supertest `.set(...)`. */
  auth: { Authorization: string };
}

/** Creates (or reuses) a user and mints a session directly; the OTP flow has its own e2e. */
export async function loginAs(ctx: TestApp, email = e2eEmail('user')): Promise<TestSession> {
  const user = await ctx.prisma.user.upsert({
    where: { email },
    create: { email },
    update: {},
    select: { id: true },
  });
  const device = await ctx.prisma.device.create({
    data: { userId: user.id, platform: 'ANDROID', name: 'e2e' },
    select: { id: true },
  });
  const tokens = await ctx.app.get(TokenService).issueSession(user.id, device.id);
  return {
    userId: user.id,
    deviceId: device.id,
    email,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    auth: { Authorization: `Bearer ${tokens.accessToken}` },
  };
}
