import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service.js';

/** Foreign keys the user may point at: system or own categories, active sources, own commitments. */
@Injectable()
export class ReferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCategory(userId: string, categoryId: string | null | undefined): Promise<void> {
    if (!categoryId) return;
    const found = await this.prisma.category.findFirst({
      where: { id: categoryId, OR: [{ userId: null }, { userId }] },
      select: { id: true },
    });
    if (!found) throw new NotFoundException();
  }

  async assertSource(sourceId: string | null | undefined): Promise<void> {
    if (!sourceId) return;
    const found = await this.prisma.source.findFirst({
      where: { id: sourceId, active: true },
      select: { id: true },
    });
    if (!found) throw new NotFoundException();
  }

  async assertCommitment(userId: string, commitmentId: string | null | undefined): Promise<void> {
    if (!commitmentId) return;
    const found = await this.prisma.commitment.findFirst({
      where: { id: commitmentId, userId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException();
  }
}
