import { Body, Controller, Delete, Get, HttpCode, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  type IngestConfig,
  IngestConfigSchema,
  type IngestToken,
  IngestTokenSchema,
  type PushTokenInput,
  PushTokenSchema,
} from '@findemes/shared';

import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { AlertsService } from '../push/alerts.service.js';
import { IngestTokenService } from './ingest-token.service.js';

@ApiTags('devices')
@ApiBearerAuth()
@Controller('devices/current')
export class DevicesController {
  constructor(
    private readonly tokens: IngestTokenService,
    private readonly alerts: AlertsService,
  ) {}

  /** The phone's Expo push token for server alerts (null turns them off on this phone). */
  @Put('push-token')
  @HttpCode(204)
  async pushToken(
    @CurrentUser() user: AuthUser,
    @Body({ schema: PushTokenSchema }) body: PushTokenInput,
  ): Promise<void> {
    await this.alerts.setToken(await this.tokens.deviceOf(user), body.token);
  }

  /** Turns automatic capture on for this phone (or rotates its token). The token is shown once. */
  @Post('ingest-token')
  @ApiOkResponse({ standardSchema: IngestTokenSchema })
  issue(@CurrentUser() user: AuthUser): Promise<IngestToken> {
    return this.tokens.issue(user);
  }

  /**
   * The capture whitelist, read by the app on every open so a phone that turned capture on
   * earlier picks up apps added since (the native module only refreshes every few hours).
   */
  @Get('ingest-config')
  @ApiOkResponse({ standardSchema: IngestConfigSchema })
  async config(): Promise<IngestConfig> {
    return { packages: await this.tokens.whitelist() };
  }

  /** Turns automatic capture off for this phone. */
  @Delete('ingest-token')
  @HttpCode(204)
  revoke(@CurrentUser() user: AuthUser): Promise<void> {
    return this.tokens.revoke(user);
  }
}
