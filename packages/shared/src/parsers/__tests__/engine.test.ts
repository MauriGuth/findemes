import { describe, expect, it } from 'vitest';

import { fingerprintInput, notificationText, parseNotification } from '../engine.js';
import { normalizeMerchant } from '../merchant.js';
import { definitionToTemplateData, ParserTemplateDefinitionSchema } from '../templates/index.js';
import { type ParserTemplateData } from '../types.js';

/*
 * SYNTHETIC texts for a fake "test-source". They exercise the engine mechanics only;
 * they are not, and must not be read as, the format of any real bank or wallet.
 */
const spend = definitionToTemplateData({
  source: 'test-source',
  name: 'spend',
  priority: 10,
  confidence: 0.95,
  pattern: String.raw`^TEST GASTO (?<currency>US\$|\$)\s?(?<amount>[\d.,]+) EN (?<merchant>.+)$`,
  fieldMap: { direction: 'OUT', method: 'WALLET' },
});
const received = definitionToTemplateData({
  source: 'test-source',
  name: 'received',
  priority: 20,
  confidence: 0.8,
  pattern: String.raw`^TEST RECIBISTE \$\s?(?<amount>[\d.,]+)`,
  fieldMap: { direction: 'IN', method: 'TRANSFER', merchantFixed: 'Transferencia recibida' },
});
const greedy = definitionToTemplateData({
  source: 'test-source',
  name: 'greedy',
  priority: 90,
  confidence: 0.7,
  pattern: String.raw`\$\s?(?<amount>[\d.,]+)`,
  fieldMap: { direction: 'OUT', method: 'DEBIT' },
});
const templates: ParserTemplateData[] = [greedy, received, spend];

describe('parseNotification (synthetic source)', () => {
  it('picks the lowest priority that matches and maps groups', () => {
    expect(parseNotification('TEST GASTO $1.234,56 EN Café Martínez Suc. 12', templates)).toEqual({
      amount: '1234.56',
      currency: 'ARS',
      direction: 'OUT',
      method: 'WALLET',
      merchantRaw: 'Café Martínez Suc. 12',
      merchantNorm: 'CAFE MARTINEZ',
      confidence: 0.95,
      templateId: 'test-source:spend',
    });
  });

  it('reads USD from the currency group', () => {
    expect(parseNotification('TEST GASTO US$ 25,00 EN SHOP', templates)?.currency).toBe('USD');
  });

  it('uses the fixed merchant and the template confidence', () => {
    const parsed = parseNotification('TEST RECIBISTE $ 50.000', templates);
    expect(parsed).toMatchObject({
      amount: '50000.00',
      direction: 'IN',
      merchantRaw: 'Transferencia recibida',
      confidence: 0.8,
    });
  });

  it('falls through to the next template when the amount is not valid', () => {
    const parsed = parseNotification('TEST GASTO $abc EN X y además $300', templates);
    expect(parsed?.templateId).toBe('test-source:greedy');
    expect(parsed?.amount).toBe('300.00');
  });

  it('rejects zero amounts and returns null without a match', () => {
    expect(parseNotification('TEST RECIBISTE $0,00', [received])).toBeNull();
    expect(parseNotification('Promo: 30% off', templates)).toBeNull();
  });

  it('skips templates whose regex does not compile', () => {
    const broken = { ...spend, id: 'broken', priority: 0, pattern: '(?<amount>[' };
    expect(parseNotification('TEST GASTO $10 EN X', [broken, spend])?.templateId).toBe(
      'test-source:spend',
    );
  });
});

describe('ParserTemplateDefinitionSchema', () => {
  it('requires an amount group and a valid regex', () => {
    const base = {
      source: 's',
      name: 'n',
      confidence: 0.9,
      fieldMap: { direction: 'OUT', method: 'DEBIT' },
    } as const;
    expect(
      ParserTemplateDefinitionSchema.safeParse({ ...base, pattern: 'no groups' }).success,
    ).toBe(false);
    expect(ParserTemplateDefinitionSchema.safeParse({ ...base, pattern: '(' }).success).toBe(false);
    expect(
      ParserTemplateDefinitionSchema.safeParse({ ...base, pattern: '(?<amount>\\d+)' }).success,
    ).toBe(true);
  });
});

describe('notificationText', () => {
  it('prefers bigText over text and keeps subText last', () => {
    expect(
      notificationText({ title: ' T ', text: 'short', bigText: 'long body', subText: 'sub' }),
    ).toBe('T\nlong body\nsub');
    expect(notificationText({ title: null, text: 'only' })).toBe('only');
  });
});

describe('normalizeMerchant', () => {
  it.each([
    ['Café Martínez Suc. 12', 'CAFE MARTINEZ'],
    ['CAFE MARTINEZ', 'CAFE MARTINEZ'],
    ['Supermercado Día S.A.', 'SUPERMERCADO DIA'],
    ['Farmacity SRL #0042', 'FARMACITY'],
    ['  ', null],
    [null, null],
  ])('%j → %j', (raw, expected) => {
    expect(normalizeMerchant(raw)).toBe(expected);
  });
});

describe('fingerprintInput', () => {
  const base = {
    userId: 'u',
    sourceId: 's',
    amount: '100.00',
    merchantNorm: 'X',
  };
  it('is equal inside the same 2-minute bucket and differs across buckets', () => {
    const a = fingerprintInput({ ...base, occurredAt: new Date('2026-09-23T12:00:10Z') });
    const b = fingerprintInput({ ...base, occurredAt: new Date('2026-09-23T12:01:50Z') });
    const c = fingerprintInput({ ...base, occurredAt: new Date('2026-09-23T12:02:00Z') });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
});
