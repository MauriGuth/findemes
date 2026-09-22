import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type Commitment,
  CommitmentListSchema,
  CommitmentSchema,
  CreateCommitmentSchema,
  ListCommitmentsQuerySchema,
  type MonthPlan,
  MonthKeySchema,
  MonthPlanSchema,
  UpdateCommitmentSchema,
  UpsertMonthPlanSchema,
  UuidSchema,
} from '@findemes/shared';
import { type z } from 'zod';

import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { CommitmentsService } from './commitments.service.js';
import { PlansService } from './plans.service.js';

@ApiTags('plans')
@ApiBearerAuth()
@Controller('plans')
export class PlansController {
  constructor(private readonly plans: PlansService) {}

  @Get(':month')
  @ApiOperation({ summary: 'The plan for a month (404 until the user sets one)' })
  @ApiOkResponse({ standardSchema: MonthPlanSchema })
  get(
    @CurrentUser() user: AuthUser,
    @Param('month', { schema: MonthKeySchema }) month: string,
  ): Promise<MonthPlan> {
    return this.plans.get(user.id, month);
  }

  @Put(':month')
  @ApiOperation({ summary: 'Create or update the plan: expected income and confirmed salary' })
  @ApiOkResponse({ standardSchema: MonthPlanSchema })
  upsert(
    @CurrentUser() user: AuthUser,
    @Param('month', { schema: MonthKeySchema }) month: string,
    @Body({ schema: UpsertMonthPlanSchema }) body: z.output<typeof UpsertMonthPlanSchema>,
  ): Promise<MonthPlan> {
    return this.plans.upsert(user.id, month, body);
  }
}

@ApiTags('commitments')
@ApiBearerAuth()
@Controller('commitments')
export class CommitmentsController {
  constructor(private readonly commitments: CommitmentsService) {}

  @Get()
  @ApiOperation({ summary: 'Rent, services, installments, subscriptions, debits' })
  @ApiOkResponse({ standardSchema: CommitmentListSchema })
  async list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: ListCommitmentsQuerySchema })
    query: z.output<typeof ListCommitmentsQuerySchema>,
  ): Promise<{ items: Commitment[] }> {
    return { items: await this.commitments.list(user.id, query.includeInactive ?? false) };
  }

  @Post()
  @ApiOperation({ summary: 'Create a commitment' })
  @ApiCreatedResponse({ standardSchema: CommitmentSchema })
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: CreateCommitmentSchema }) body: z.output<typeof CreateCommitmentSchema>,
  ): Promise<Commitment> {
    return this.commitments.create(user.id, body);
  }

  @Get(':id')
  @ApiOkResponse({ standardSchema: CommitmentSchema })
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: UuidSchema }) id: string,
  ): Promise<Commitment> {
    return this.commitments.get(user.id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit; endsOn before startsOn pauses it instead' })
  @ApiOkResponse({ standardSchema: CommitmentSchema })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: UuidSchema }) id: string,
    @Body({ schema: UpdateCommitmentSchema }) body: z.output<typeof UpdateCommitmentSchema>,
  ): Promise<Commitment> {
    return this.commitments.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete; its payments stay as plain expenses' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: UuidSchema }) id: string,
  ): Promise<void> {
    await this.commitments.remove(user.id, id);
  }
}
