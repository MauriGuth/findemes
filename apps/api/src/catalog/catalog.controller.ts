import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type Category, CategorySchema, type Source, SourceSchema } from '@findemes/shared';
import { z } from 'zod';

import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { CatalogService } from './catalog.service.js';

@ApiTags('catalog')
@ApiBearerAuth()
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /** Banks and wallets the app knows about. */
  @Get('sources')
  @ApiOkResponse({ standardSchema: z.array(SourceSchema) })
  sources(): Promise<Source[]> {
    return this.catalog.listSources();
  }

  /** System categories plus the user's own. */
  @Get('categories')
  @ApiOkResponse({ standardSchema: z.array(CategorySchema) })
  categories(@CurrentUser() user: AuthUser): Promise<Category[]> {
    return this.catalog.listCategories(user.id);
  }
}
