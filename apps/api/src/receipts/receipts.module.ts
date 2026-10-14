import { Module } from '@nestjs/common';

import { IngestModule } from '../ingest/ingest.module.js';
import { ReceiptsController } from './receipts.controller.js';
import { ReceiptsService } from './receipts.service.js';

@Module({
  imports: [IngestModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
