import { Module } from '@nestjs/common';

import {
  AdminController,
  ExportController,
  LegalController,
  RecurringController,
} from './beta.controller.js';
import { BetaService } from './beta.service.js';

@Module({
  controllers: [RecurringController, ExportController, LegalController, AdminController],
  providers: [BetaService],
})
export class BetaModule {}
