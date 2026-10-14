import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  type Budget,
  BudgetListSchema,
  BudgetSchema,
  type MonthKey,
  MonthKeySchema,
  type Stats,
  StatsSchema,
  type UpsertBudgetInput,
  UpsertBudgetSchema,
} from '@findemes/shared';
import { z } from 'zod';

import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { BudgetsService } from './budgets.service.js';

const MonthQuerySchema = z.strictObject({ month: MonthKeySchema.optional() });

@ApiTags('budgets')
@ApiBearerAuth()
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  /** Each budget with what was spent in its category this period (or `month`). */
  @Get()
  @ApiOkResponse({ standardSchema: BudgetListSchema })
  list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: MonthQuerySchema }) query: { month?: MonthKey },
  ): Promise<{ month: MonthKey; items: Budget[] }> {
    return this.budgets.list(user.id, query.month);
  }

  @Put()
  @ApiOkResponse({ standardSchema: BudgetSchema })
  upsert(
    @CurrentUser() user: AuthUser,
    @Body({ schema: UpsertBudgetSchema }) body: UpsertBudgetInput,
  ): Promise<Budget> {
    return this.budgets.upsert(user.id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.budgets.remove(user.id, id);
  }
}

@ApiTags('insights')
@ApiBearerAuth()
@Controller('insights')
export class StatsController {
  constructor(private readonly budgets: BudgetsService) {}

  /** Daily average, categories, weekday and the previous period (nominal amounts). */
  @Get('stats')
  @ApiOkResponse({ standardSchema: StatsSchema })
  stats(
    @CurrentUser() user: AuthUser,
    @Query({ schema: MonthQuerySchema }) query: { month?: MonthKey },
  ): Promise<Stats> {
    return this.budgets.stats(user.id, query.month);
  }
}
