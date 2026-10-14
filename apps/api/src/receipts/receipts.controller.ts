import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  type CreateReceiptInput,
  CreateReceiptSchema,
  type Receipt,
  ReceiptListSchema,
  ReceiptSchema,
  type ReceiptUpload,
  ReceiptUploadSchema,
} from '@findemes/shared';

import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ReceiptsService } from './receipts.service.js';

@ApiTags('receipts')
@ApiBearerAuth()
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get()
  @ApiOkResponse({ standardSchema: ReceiptListSchema })
  async list(@CurrentUser() user: AuthUser): Promise<{ items: Receipt[] }> {
    return { items: await this.receipts.list(user.id) };
  }

  /** A presigned URL to PUT the compressed photo (JPEG, ≤ 5 MB), valid 10 minutes. */
  @Post('upload-url')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: ReceiptUploadSchema })
  uploadUrl(@CurrentUser() user: AuthUser): ReceiptUpload {
    return this.receipts.uploadUrl(user.id);
  }

  @Post()
  @ApiOkResponse({ standardSchema: ReceiptSchema })
  create(
    @CurrentUser() user: AuthUser,
    @Body({ schema: CreateReceiptSchema }) body: CreateReceiptInput,
  ): Promise<Receipt> {
    return this.receipts.create(user.id, body.key);
  }

  @Get(':id')
  @ApiOkResponse({ standardSchema: ReceiptSchema })
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<Receipt> {
    return this.receipts.get(user.id, id);
  }

  @Post(':id/retry')
  @HttpCode(200)
  @ApiOkResponse({ standardSchema: ReceiptSchema })
  retry(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string): Promise<Receipt> {
    return this.receipts.retry(user.id, id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.receipts.remove(user.id, id);
  }
}
