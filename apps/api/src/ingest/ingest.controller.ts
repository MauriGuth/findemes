import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type IngestBatch,
  IngestBatchSchema,
  type IngestConfig,
  IngestConfigSchema,
  type IngestResult,
  IngestResultSchema,
} from '@findemes/shared';

import { CurrentIngestDevice, IngestAuth } from './ingest-auth.guard.js';
import { type IngestDevice } from './ingest-token.service.js';
import { IngestService } from './ingest.service.js';

const MINUTE = 60_000;

@ApiTags('ingest')
@IngestAuth()
@Controller('ingest')
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  /** Whitelist for the listener; also tells the API the listener is alive. */
  @Get('config')
  @ApiOkResponse({ standardSchema: IngestConfigSchema })
  config(@CurrentIngestDevice() device: IngestDevice): Promise<IngestConfig> {
    return this.ingest.config(device);
  }

  @Post('notifications')
  @HttpCode(200)
  @Throttle({ minute: { limit: 120, ttl: MINUTE } })
  @ApiOkResponse({ standardSchema: IngestResultSchema })
  notifications(
    @CurrentIngestDevice() device: IngestDevice,
    @Body({ schema: IngestBatchSchema }) batch: IngestBatch,
  ): Promise<IngestResult> {
    return this.ingest.ingest(device, batch.items);
  }
}
