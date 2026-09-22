import { Module } from '@nestjs/common';

import { PlansModule } from '../plans/plans.module.js';
import { CommitmentPaymentsController, TransactionsController } from './transactions.controller.js';
import { TransactionsService } from './transactions.service.js';

@Module({
  imports: [PlansModule],
  controllers: [TransactionsController, CommitmentPaymentsController],
  providers: [TransactionsService],
  exports: [TransactionsService],
})
export class TransactionsModule {}
