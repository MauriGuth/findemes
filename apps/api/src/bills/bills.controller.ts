import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  type Bill,
  BillListQuerySchema,
  BillListSchema,
  BillSchema,
  type CreateBillInput,
  CreateBillSchema,
  type PayBillInput,
  PayBillSchema,
  type Transaction,
  type UpdateBillInput,
  UpdateBillSchema,
} from '@findemes/shared';
import { type z } from 'zod';

import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { BillsService } from './bills.service.js';

@ApiTags('bills')
@ApiBearerAuth()
@Controller('bills')
export class BillsController {
  constructor(private readonly bills: BillsService) {}

  /** "Por pagar": bills due in the month plus unpaid ones overdue. */
  @Get()
  @ApiOkResponse({ standardSchema: BillListSchema })
  async list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: BillListQuerySchema }) query: z.infer<typeof BillListQuerySchema>,
  ): Promise<{ items: Bill[] }> {
    return { items: await this.bills.list(user.id, query.month) };
  }

  @Post()
  @ApiOkResponse({ standardSchema: BillSchema })
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: CreateBillSchema }) body: CreateBillInput,
  ): Promise<Bill> {
    return this.bills.create(user.id, body);
  }

  @Patch(':id')
  @ApiOkResponse({ standardSchema: BillSchema })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: UpdateBillSchema }) body: UpdateBillInput,
  ): Promise<Bill> {
    return this.bills.update(user.id, id, body);
  }

  /** Movements that could be this bill's payment. */
  @Get(':id/candidates')
  candidates(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<Transaction[]> {
    return this.bills.candidates(user.id, id);
  }

  /** "Pagué". */
  @Post(':id/payments')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: BillSchema })
  pay(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body({ schema: PayBillSchema }) body: PayBillInput,
  ): Promise<Bill> {
    return this.bills.pay(user.id, id, body);
  }
}
