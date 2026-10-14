import { Module } from '@nestjs/common';

import { PlansModule } from '../plans/plans.module.js';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { BillsController } from './bills.controller.js';
import { BillsService } from './bills.service.js';

@Module({
  imports: [PlansModule, TransactionsModule],
  controllers: [BillsController],
  providers: [BillsService],
})
export class BillsModule {}
