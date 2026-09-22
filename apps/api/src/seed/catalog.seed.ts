import { type PrismaClient } from '../generated/prisma/client.js';
import { CATEGORIES, SOURCES } from './catalog.data.js';

export interface SeedResult {
  sources: number;
  categories: number;
}

/**
 * Idempotent: upserts sources by slug and system categories by slug, never
 * deletes, never touches user-created categories or verified package names.
 */
export async function seedCatalog(prisma: PrismaClient): Promise<SeedResult> {
  for (const source of SOURCES) {
    await prisma.source.upsert({
      where: { slug: source.slug },
      create: { slug: source.slug, name: source.name, kind: source.kind },
      update: { name: source.name, kind: source.kind },
    });
  }

  // System categories have userId = null, which Postgres unique constraints treat as
  // distinct values, so the lookup is explicit and the seed runs serially.
  for (const category of CATEGORIES) {
    const existing = await prisma.category.findFirst({
      where: { userId: null, slug: category.slug },
      select: { id: true },
    });
    if (existing) {
      await prisma.category.update({
        where: { id: existing.id },
        data: { name: category.name, icon: category.icon, sortOrder: category.sortOrder },
      });
    } else {
      await prisma.category.create({
        data: {
          userId: null,
          slug: category.slug,
          name: category.name,
          icon: category.icon,
          sortOrder: category.sortOrder,
        },
      });
    }
  }

  return {
    sources: await prisma.source.count(),
    categories: await prisma.category.count({ where: { userId: null } }),
  };
}
