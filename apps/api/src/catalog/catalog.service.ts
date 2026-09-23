import { Injectable } from '@nestjs/common';
import { type Category, type Source } from '@findemes/shared';

import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listSources(): Promise<Source[]> {
    const rows = await this.prisma.source.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, slug: true, name: true, kind: true, active: true, packageName: true },
    });
    // The package name itself is not exposed; only whether capture reads this source.
    return rows.map(({ packageName, ...source }) => ({
      ...source,
      captureEnabled: packageName !== null,
    }));
  }

  /** System categories plus the user's own, ordered for display. */
  async listCategories(userId?: string): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({
      where: userId ? { OR: [{ userId: null }, { userId }] } : { userId: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        userId: true,
        slug: true,
        name: true,
        icon: true,
        parentId: true,
        sortOrder: true,
      },
    });
    return rows;
  }
}
