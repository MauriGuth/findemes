import { Module } from '@nestjs/common';

import { ReceiptsModule } from '../receipts/receipts.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { EntriesController, FeaturesController } from './entries.controller.js';
import { EntriesService } from './entries.service.js';

@Module({
  imports: [TransactionsModule, ReceiptsModule],
  controllers: [EntriesController, FeaturesController],
  providers: [EntriesService],
  exports: [EntriesService],
})
export class EntriesModule {}
