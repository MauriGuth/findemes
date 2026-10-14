import { Module } from '@nestjs/common';

import { PlansModule } from '../plans/plans.module.js';
import { BudgetsController, StatsController } from './budgets.controller.js';
import { BudgetsService } from './budgets.service.js';

@Module({
  imports: [PlansModule],
  controllers: [BudgetsController, StatsController],
  providers: [BudgetsService],
})
export class BudgetsModule {}
