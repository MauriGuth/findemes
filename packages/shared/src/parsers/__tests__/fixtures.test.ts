import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseNotification } from '../engine.js';
import {
  definitionToTemplateData,
  ParserTemplateDefinitionSchema,
  TEMPLATE_DEFINITIONS,
} from '../templates/index.js';

const FIXTURES = resolve(import.meta.dirname, '../__fixtures__');

interface Case {
  source: string;
  name: string;
  text: string;
  expected: Record<string, unknown> & { template: string | null };
}

function loadCases(): Case[] {
  if (!existsSync(FIXTURES)) return [];
  const cases: Case[] = [];
  for (const source of readdirSync(FIXTURES, { withFileTypes: true })) {
    if (!source.isDirectory()) continue;
    const dir = resolve(FIXTURES, source.name);
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.txt'))) {
      const name = file.slice(0, -4);
      cases.push({
        source: source.name,
        name,
        text: readFileSync(resolve(dir, file), 'utf8').replace(/\r\n/g, '\n').trimEnd(),
        expected: JSON.parse(
          readFileSync(resolve(dir, `${name}.expected.json`), 'utf8'),
        ) as Case['expected'],
      });
    }
  }
  return cases;
}

const cases = loadCases();

describe('template definitions', () => {
  it('are valid and unique per source', () => {
    const keys = new Set<string>();
    for (const definition of TEMPLATE_DEFINITIONS) {
      expect(ParserTemplateDefinitionSchema.safeParse(definition).success).toBe(true);
      const key = `${definition.source}:${definition.name}`;
      expect(keys.has(key)).toBe(false);
      keys.add(key);
    }
  });

  it('every source with templates has real fixtures', () => {
    const withFixtures = new Set(cases.map((c) => c.source));
    for (const definition of TEMPLATE_DEFINITIONS) {
      expect(withFixtures.has(definition.source)).toBe(true);
    }
  });
});

describe.runIf(cases.length > 0)('real fixtures', () => {
  it.each(cases.map((c) => [`${c.source}/${c.name}`, c] as const))('%s', (_label, c) => {
    const templates = TEMPLATE_DEFINITIONS.filter((d) => d.source === c.source).map(
      definitionToTemplateData,
    );
    const parsed = parseNotification(c.text, templates);
    if (c.expected.template === null) {
      expect(parsed).toBeNull();
      return;
    }
    const { template, ...fields } = c.expected;
    expect(parsed).not.toBeNull();
    expect(parsed?.templateId).toBe(`${c.source}:${template}`);
    expect(parsed).toMatchObject(fields);
  });
});
