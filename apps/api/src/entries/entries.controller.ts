import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  EntryDraftListSchema,
  type EntryDraft,
  type Features,
  FeaturesSchema,
  type ParseEntryInput,
  ParseEntrySchema,
  type SaveEntriesInput,
  SaveEntriesSchema,
  type Transaction,
  TransactionListSchema,
} from '@findemes/shared';

import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { type Env } from '../config/env.schema.js';
import { ReceiptsService } from '../receipts/receipts.service.js';
import { EntriesService } from './entries.service.js';

@ApiTags('entries')
@ApiBearerAuth()
@Controller('entries')
export class EntriesController {
  constructor(private readonly entries: EntriesService) {}

  /** Reads what the user typed and proposes movements; saves nothing. */
  @Post('parse')
  @HttpCode(200)
  @Throttle({ minute: { limit: 10, ttl: 60_000 } })
  @ApiOkResponse({ standardSchema: EntryDraftListSchema })
  async parse(
    @CurrentUser() user: AuthUser,
    @Body({ schema: ParseEntrySchema }) body: ParseEntryInput,
  ): Promise<{ drafts: EntryDraft[] }> {
    return { drafts: await this.entries.parse(user.id, body.text) };
  }

  @Post()
  @ApiOkResponse({ standardSchema: TransactionListSchema })
  async save(
    @CurrentUser() user: AuthUser,
    @Body({ schema: SaveEntriesSchema }) body: SaveEntriesInput,
  ): Promise<{ items: Transaction[] }> {
    return { items: await this.entries.save(user.id, body.drafts) };
  }
}

@ApiTags('features')
@ApiBearerAuth()
@Controller('features')
export class FeaturesController {
  constructor(
    private readonly entries: EntriesService,
    private readonly receipts: ReceiptsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** What this server has configured, so the app hides what is not available yet. */
  @Get()
  @ApiOkResponse({ standardSchema: FeaturesSchema })
  get(): Features {
    return {
      receipts: this.receipts.enabled,
      aiEntries: this.entries.enabled,
      telegram: Boolean(this.config.get('TELEGRAM_BOT_TOKEN', { infer: true })),
      whatsapp: Boolean(this.config.get('WHATSAPP_ACCESS_TOKEN', { infer: true })),
    };
  }
}
