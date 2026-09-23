import { Prisma } from '../../src/generated/prisma/client.js';
import { type PrismaService } from '../../src/prisma/prisma.service.js';

let counter = 0;

export interface E2eSource {
  id: string;
  slug: string;
  packageName: string;
}

/*
 * SYNTHETIC source and templates for the ingest pipeline tests. The texts they match
 * ("E2E GASTO ...") are invented on purpose and are not the format of any real app.
 */
export async function createE2eSource(prisma: PrismaService): Promise<E2eSource> {
  counter += 1;
  const suffix = `${String(process.pid)}-${String(counter)}`;
  const source = await prisma.source.create({
    data: {
      slug: `e2e-bank-${suffix}`,
      name: 'E2E Bank',
      kind: 'BANK',
      packageName: `test.e2e.bank${suffix.replace('-', '.')}`,
    },
    select: { id: true, slug: true, packageName: true },
  });
  const templates = [
    {
      name: 'spend',
      priority: 10,
      confidence: '0.95',
      pattern: String.raw`^E2E GASTO \$\s?(?<amount>[\d.,]+) EN (?<merchant>.+)$`,
      fieldMap: { direction: 'OUT', method: 'DEBIT' },
    },
    {
      name: 'maybe-spend',
      priority: 20,
      confidence: '0.75',
      pattern: String.raw`^E2E QUIZAS \$\s?(?<amount>[\d.,]+) EN (?<merchant>.+)$`,
      fieldMap: { direction: 'OUT', method: 'WALLET' },
    },
    {
      name: 'received',
      priority: 30,
      confidence: '0.95',
      pattern: String.raw`^E2E RECIBISTE \$\s?(?<amount>[\d.,]+)`,
      fieldMap: { direction: 'IN', method: 'TRANSFER', merchantFixed: 'Transferencia recibida' },
    },
  ];
  for (const t of templates) {
    await prisma.parserTemplate.create({
      data: {
        sourceId: source.id,
        name: t.name,
        pattern: t.pattern,
        priority: t.priority,
        confidence: new Prisma.Decimal(t.confidence),
        fieldMap: t.fieldMap,
      },
    });
  }
  return { id: source.id, slug: source.slug, packageName: source.packageName ?? '' };
}
