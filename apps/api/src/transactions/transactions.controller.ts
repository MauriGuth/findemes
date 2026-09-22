import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  type Commitment,
  CommitmentSchema,
  CreateInstallmentPurchaseSchema,
  CreateTransactionSchema,
  ListTransactionsQuerySchema,
  PayCommitmentSchema,
  type Transaction,
  TransactionListSchema,
  TransactionSchema,
  UpdateTransactionSchema,
  UuidSchema,
} from '@findemes/shared';
import { type z } from 'zod';

import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { CommitmentsService } from '../plans/commitments.service.js';
import { TransactionsService } from './transactions.service.js';

@ApiTags('transactions')
@ApiBearerAuth()
@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly commitments: CommitmentsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Movements of a month (Argentina time), newest first, up to 500' })
  @ApiOkResponse({ standardSchema: TransactionListSchema })
  async list(
    @CurrentUser() user: AuthUser,
    @Query({ schema: ListTransactionsQuerySchema })
    query: z.output<typeof ListTransactionsQuerySchema>,
  ): Promise<{ items: Transaction[] }> {
    return { items: await this.transactions.list(user.id, query) };
  }

  @Post()
  @ApiOperation({ summary: 'Load a movement by hand' })
  @ApiCreatedResponse({ standardSchema: TransactionSchema })
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: CreateTransactionSchema }) body: z.output<typeof CreateTransactionSchema>,
  ): Promise<Transaction> {
    return this.transactions.create(user.id, body);
  }

  /** Creates the installment commitment only: the purchase itself never enters the statement. */
  @Post('installments')
  @ApiOperation({ summary: 'A credit card purchase in installments' })
  @ApiCreatedResponse({ standardSchema: CommitmentSchema })
  installments(
    @CurrentUser() user: AuthUser,
    @Body({ schema: CreateInstallmentPurchaseSchema })
    body: z.output<typeof CreateInstallmentPurchaseSchema>,
  ): Promise<Commitment> {
    return this.commitments.createInstallmentPurchase(user.id, body);
  }

  @Get(':id')
  @ApiOkResponse({ standardSchema: TransactionSchema })
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: UuidSchema }) id: string,
  ): Promise<Transaction> {
    return this.transactions.get(user.id, id);
  }

  @Patch(':id')
  @ApiOkResponse({ standardSchema: TransactionSchema })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: UuidSchema }) id: string,
    @Body({ schema: UpdateTransactionSchema }) body: z.output<typeof UpdateTransactionSchema>,
  ): Promise<Transaction> {
    return this.transactions.update(user.id, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: UuidSchema }) id: string,
  ): Promise<void> {
    await this.transactions.remove(user.id, id);
  }
}

@ApiTags('commitments')
@ApiBearerAuth()
@Controller('commitments')
export class CommitmentPaymentsController {
  constructor(private readonly transactions: TransactionsService) {}

  /** "Pagué": records the payment with the commitment's defaults. 409 if that month is already settled. */
  @Post(':id/payments')
  @ApiOperation({ summary: 'Mark a commitment as paid for a month' })
  @ApiCreatedResponse({ standardSchema: TransactionSchema })
  pay(
    @CurrentUser() user: AuthUser,
    @Param('id', { schema: UuidSchema }) id: string,
    @Body({ schema: PayCommitmentSchema }) body: z.output<typeof PayCommitmentSchema>,
  ): Promise<Transaction> {
    return this.transactions.payCommitment(user.id, id, body);
  }
}
