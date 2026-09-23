import {
  ParserTemplateDefinitionSchema,
  type ParserTemplateDefinition,
  TEMPLATE_DEFINITIONS,
} from '@findemes/shared';

import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { CATEGORIES, SOURCES } from './catalog.data.js';

export interface SeedResult {
  sources: number;
  categories: number;
  templates: number;
}

/**
 * Idempotent: upserts sources by slug and system categories by slug, never
 * deletes, never touches user-created categories. A package name is written only
 * when the data file carries one (verified by Mauricio); it is never cleared.
 */
export async function seedCatalog(
  prisma: PrismaClient,
  templates: readonly ParserTemplateDefinition[] = TEMPLATE_DEFINITIONS,
): Promise<SeedResult> {
  for (const source of SOURCES) {
    const packageName = source.packageName ? { packageName: source.packageName } : {};
    await prisma.source.upsert({
      where: { slug: source.slug },
      create: { slug: source.slug, name: source.name, kind: source.kind, ...packageName },
      update: { name: source.name, kind: source.kind, ...packageName },
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

  await syncTemplates(prisma, templates);

  return {
    sources: await prisma.source.count(),
    categories: await prisma.category.count({ where: { userId: null } }),
    templates: await prisma.parserTemplate.count({
      where: { active: true, source: { slug: { in: SOURCES.map((s) => s.slug) } } },
    }),
  };
}

/** jsonb reorders object keys, so compare with keys sorted. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sameDefinition(
  row: { pattern: string; fieldMap: unknown; priority: number; confidence: Prisma.Decimal },
  definition: ReturnType<typeof ParserTemplateDefinitionSchema.parse>,
): boolean {
  return (
    row.pattern === definition.pattern &&
    row.priority === definition.priority &&
    row.confidence.toNumber() === definition.confidence &&
    stableJson(row.fieldMap) === stableJson(definition.fieldMap)
  );
}

/**
 * Templates live in the repo (packages/shared/src/parsers/templates) with their fixtures.
 * Each deploy publishes a new version when a definition changes and deactivates versions
 * and names that are gone. Rows are never deleted, so a movement can always be traced.
 */
async function syncTemplates(
  prisma: PrismaClient,
  definitions: readonly ParserTemplateDefinition[],
): Promise<void> {
  const sources = await prisma.source.findMany({ select: { id: true, slug: true } });
  const sourceIdBySlug = new Map(sources.map((s) => [s.slug, s.id]));
  const keep = new Set<string>();

  for (const raw of definitions) {
    const definition = ParserTemplateDefinitionSchema.parse(raw);
    const sourceId = sourceIdBySlug.get(definition.source);
    if (!sourceId)
      throw new Error(`Template ${definition.name}: unknown source ${definition.source}`);

    const latest = await prisma.parserTemplate.findFirst({
      where: { sourceId, name: definition.name },
      orderBy: { version: 'desc' },
    });
    let activeId: string;
    if (latest && sameDefinition(latest, definition)) {
      activeId = latest.id;
      if (!latest.active) {
        await prisma.parserTemplate.update({ where: { id: latest.id }, data: { active: true } });
      }
    } else {
      const created = await prisma.parserTemplate.create({
        data: {
          sourceId,
          name: definition.name,
          version: (latest?.version ?? 0) + 1,
          pattern: definition.pattern,
          fieldMap: definition.fieldMap,
          priority: definition.priority,
          confidence: new Prisma.Decimal(definition.confidence),
          active: true,
        },
      });
      activeId = created.id;
    }
    keep.add(activeId);
  }

  // Only sources this seed owns: templates attached to other sources (tests) are left alone.
  const seededSourceIds = SOURCES.map((s) => sourceIdBySlug.get(s.slug)).filter(
    (id): id is string => !!id,
  );
  await prisma.parserTemplate.updateMany({
    where: { active: true, sourceId: { in: seededSourceIds }, id: { notIn: [...keep] } },
    data: { active: false },
  });
}
