import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { type MonthSummary, MonthSummarySchema, SummaryQuerySchema } from '@findemes/shared';
import { type z } from 'zod';

import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { InsightsService } from './insights.service.js';

@ApiTags('insights')
@ApiBearerAuth()
@Controller('insights')
export class InsightsController {
  constructor(private readonly insights: InsightsService) {}

  /** The number at the top of the app and everything around it. */
  @Get('summary')
  @ApiOperation({ summary: '"Te quedan $X hasta el 1" for a month' })
  @ApiOkResponse({ standardSchema: MonthSummarySchema })
  summary(
    @CurrentUser() user: AuthUser,
    @Query({ schema: SummaryQuerySchema }) query: z.output<typeof SummaryQuerySchema>,
  ): Promise<MonthSummary> {
    return this.insights.summary(user.id, query.month);
  }
}
