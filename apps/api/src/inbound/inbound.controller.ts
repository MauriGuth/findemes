import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiExcludeController, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { type InboundAddress, InboundAddressSchema } from '@findemes/shared';

import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { EmailIngestService, type InboundOutcome } from './email-ingest.service.js';
import { InboundAddressService } from './inbound-address.service.js';
import { InboundAuthGuard } from './inbound-auth.guard.js';
import { type PostmarkInbound, PostmarkInboundSchema } from './postmark.schema.js';

/** Postmark's inbound webhook. Not part of the app's API, so not in Swagger. */
@ApiExcludeController()
@Controller('inbound')
export class InboundWebhookController {
  constructor(private readonly emails: EmailIngestService) {}

  @Post('postmark')
  @Public()
  @SkipThrottle()
  @UseGuards(InboundAuthGuard)
  @HttpCode(200)
  async postmark(
    @Body({ schema: PostmarkInboundSchema }) mail: PostmarkInbound,
  ): Promise<{ outcome: InboundOutcome }> {
    return { outcome: await this.emails.receive(mail) };
  }
}

@ApiTags('email')
@ApiBearerAuth()
@Controller('me/inbound')
export class InboundAddressController {
  constructor(private readonly addresses: InboundAddressService) {}

  /** Your forwarding address, and Gmail's confirmation code once it arrives. */
  @Get()
  @ApiOkResponse({ standardSchema: InboundAddressSchema })
  status(@CurrentUser() user: AuthUser): Promise<InboundAddress> {
    return this.addresses.status(user.id);
  }

  /** A new address; mail to the old one stops arriving. */
  @Post('rotate')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: InboundAddressSchema })
  rotate(@CurrentUser() user: AuthUser): Promise<InboundAddress> {
    return this.addresses.rotate(user.id);
  }
}
