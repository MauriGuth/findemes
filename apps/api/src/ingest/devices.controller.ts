import { Controller, Delete, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type IngestToken, IngestTokenSchema } from '@findemes/shared';

import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { IngestTokenService } from './ingest-token.service.js';

@ApiTags('devices')
@ApiBearerAuth()
@Controller('devices/current')
export class DevicesController {
  constructor(private readonly tokens: IngestTokenService) {}

  /** Turns automatic capture on for this phone (or rotates its token). The token is shown once. */
  @Post('ingest-token')
  @ApiOkResponse({ standardSchema: IngestTokenSchema })
  issue(@CurrentUser() user: AuthUser): Promise<IngestToken> {
    return this.tokens.issue(user);
  }

  /** Turns automatic capture off for this phone. */
  @Delete('ingest-token')
  @HttpCode(204)
  revoke(@CurrentUser() user: AuthUser): Promise<void> {
    return this.tokens.revoke(user);
  }
}
