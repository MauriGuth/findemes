import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { PRISMA_ENUMS } from '../enums.js';

const SCHEMA_PATH = resolve(import.meta.dirname, '../../../../../apps/api/prisma/schema.prisma');

function readPrismaEnums(): Record<string, string[]> {
  const schema = readFileSync(SCHEMA_PATH, 'utf8');
  const enums: Record<string, string[]> = {};
  for (const match of schema.matchAll(/enum\s+(\w+)\s*\{([^}]*)\}/g)) {
    const [, name, body] = match;
    if (!name || body === undefined) continue;
    enums[name] = body
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, '').trim())
      .filter((line) => line !== '' && !line.startsWith('@@'))
      .map((line) => line.split(/\s+/)[0] ?? '');
  }
  return enums;
}

describe('shared enums vs prisma schema', () => {
  const prismaEnums = readPrismaEnums();

  it('every shared enum exists in the Prisma schema with the same values', () => {
    for (const [name, schema] of Object.entries(PRISMA_ENUMS)) {
      expect(prismaEnums[name], `enum ${name} missing in schema.prisma`).toBeDefined();
      expect(prismaEnums[name]).toEqual(schema.options);
    }
  });

  it('every Prisma enum is mirrored in shared', () => {
    expect(Object.keys(prismaEnums).sort()).toEqual(Object.keys(PRISMA_ENUMS).sort());
  });
});
