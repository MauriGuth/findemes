import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type AuthSession,
  AuthSessionSchema,
  type AuthTokens,
  AuthTokensSchema,
  OkSchema,
  RefreshTokenSchema,
  RequestLoginCodeSchema,
  VerifyLoginCodeSchema,
} from '@findemes/shared';
import { type z } from 'zod';

import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';

const MINUTE = 60_000;
const DAY = 86_400_000;

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Sends a 6-digit code by email. Always answers ok: it never reveals whether an account exists. */
  @Post('request-code')
  @HttpCode(200)
  @Throttle({ minute: { limit: 5, ttl: MINUTE }, daily: { limit: 20, ttl: DAY } })
  @ApiOperation({ summary: 'Email a login code' })
  @ApiOkResponse({ standardSchema: OkSchema })
  async requestCode(
    @Body({ schema: RequestLoginCodeSchema }) body: z.output<typeof RequestLoginCodeSchema>,
  ): Promise<{ ok: true }> {
    await this.auth.requestCode(body.email);
    return { ok: true };
  }

  /** Exchanges the code for a session. Creates the account on first login. */
  @Post('verify-code')
  @HttpCode(200)
  @Throttle({ minute: { limit: 10, ttl: MINUTE } })
  @ApiOperation({ summary: 'Verify the login code and start a session' })
  @ApiOkResponse({ standardSchema: AuthSessionSchema })
  verifyCode(
    @Body({ schema: VerifyLoginCodeSchema }) body: z.output<typeof VerifyLoginCodeSchema>,
  ): Promise<AuthSession> {
    return this.auth.verifyCode(body.email, body.code, body.device);
  }

  /** Rotates the refresh token. Reusing an old one ends the whole session. */
  @Post('refresh')
  @HttpCode(200)
  @Throttle({ minute: { limit: 30, ttl: MINUTE } })
  @ApiOperation({ summary: 'Refresh the session' })
  @ApiOkResponse({ standardSchema: AuthTokensSchema })
  refresh(
    @Body({ schema: RefreshTokenSchema }) body: z.output<typeof RefreshTokenSchema>,
  ): Promise<AuthTokens> {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'End the session on this device' })
  async logout(
    @Body({ schema: RefreshTokenSchema }) body: z.output<typeof RefreshTokenSchema>,
  ): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }
}
