import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { type Category, CategorySchema, type Source, SourceSchema } from '@findemes/shared';
import { z } from 'zod';

import { CatalogService } from './catalog.service.js';

@ApiTags('catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /** Banks and wallets the app knows about. */
  @Get('sources')
  @ApiOkResponse({ standardSchema: z.array(SourceSchema) })
  sources(): Promise<Source[]> {
    return this.catalog.listSources();
  }

  /** System categories (user-created ones arrive with auth). */
  @Get('categories')
  @ApiOkResponse({ standardSchema: z.array(CategorySchema) })
  categories(): Promise<Category[]> {
    return this.catalog.listCategories();
  }
}
