import { Module } from '@nestjs/common';

import { CommitmentsService } from './commitments.service.js';
import { CommitmentsController, PlansController } from './plans.controller.js';
import { PlansService } from './plans.service.js';
import { ReferencesService } from './references.service.js';

@Module({
  controllers: [PlansController, CommitmentsController],
  providers: [PlansService, CommitmentsService, ReferencesService],
  exports: [PlansService, CommitmentsService, ReferencesService],
})
export class PlansModule {}
