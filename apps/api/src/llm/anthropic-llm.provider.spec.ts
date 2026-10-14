import { describe, expect, it } from 'vitest';

import { AnthropicLlmProvider, LlmOutputError } from './anthropic-llm.provider.js';

interface Captured {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

function fakeFetch(reply: object, captured: Captured[]): typeof fetch {
  const impl = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    captured.push({
      url: input instanceof Request ? input.url : input.toString(),
      headers: new Headers(init?.headers),
      body: JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as Record<
        string,
        unknown
      >,
    });
    return Promise.resolve(
      new Response(JSON.stringify(reply), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  };
  return impl;
}

function message(text: string, stop_reason = 'end_turn') {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    content: [{ type: 'text', text }],
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 420, output_tokens: 90 },
  };
}

// SYNTHETIC notification text; the HTTP layer is faked, nothing leaves the machine.
const input = { sourceName: 'Banco de prueba', text: 'Compraste $1.500 en Kiosco' };
const answer = {
  isFinancial: true,
  amount: '1500.00',
  currency: 'ARS',
  direction: 'OUT',
  method: 'DEBIT',
  merchant: 'Kiosco',
};

describe('AnthropicLlmProvider', () => {
  it('sends a structured-output request with low effort and server-side fallbacks', async () => {
    const captured: Captured[] = [];
    const provider = new AnthropicLlmProvider(
      'sk-ant-test',
      'claude-opus-5',
      5000,
      5000,
      5000,
      fakeFetch(message(JSON.stringify(answer)), captured),
    );
    const result = await provider.extractNotification(input);

    expect(result).toEqual({
      value: answer,
      model: 'claude-opus-5',
      inputTokens: 420,
      outputTokens: 90,
    });
    const [call] = captured;
    expect(call?.url).toContain('/v1/messages');
    expect(call?.headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(call?.body).toMatchObject({
      model: 'claude-opus-5',
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema' } },
    });
    expect(JSON.stringify(call?.body.messages)).toContain('<notification>');
  });

  it('does not ask for fallbacks on models without them', async () => {
    const captured: Captured[] = [];
    const provider = new AnthropicLlmProvider(
      'sk-ant-test',
      'claude-sonnet-5',
      5000,
      5000,
      5000,
      fakeFetch(message(JSON.stringify(answer)), captured),
    );
    await provider.extractNotification(input);
    expect(captured[0]?.body).not.toHaveProperty('fallbacks');
  });

  it('turns refusals and malformed output into LlmOutputError', async () => {
    const refusal = new AnthropicLlmProvider(
      'k',
      'claude-opus-5',
      5000,
      5000,
      5000,
      fakeFetch(message('', 'refusal'), []),
    );
    await expect(refusal.extractNotification(input)).rejects.toBeInstanceOf(LlmOutputError);
    const garbage = new AnthropicLlmProvider(
      'k',
      'claude-opus-5',
      5000,
      5000,
      5000,
      fakeFetch(message('{"isFinancial": "maybe"}'), []),
    );
    await expect(garbage.extractNotification(input)).rejects.toBeInstanceOf(LlmOutputError);
  });

  it('reads an email with its PDFs as documents, medium effort and its own timeout', async () => {
    const captured: Captured[] = [];
    const reply = {
      kind: 'card_statement',
      movement: null,
      statement: {
        issuer: 'Visa Banco de prueba',
        total: '150000.00',
        minimum: '15000.00',
        currency: 'ARS',
        dueOn: '2026-11-10',
      },
      bill: null,
    };
    const provider = new AnthropicLlmProvider(
      'k',
      'claude-opus-5',
      5000,
      60000,
      5000,
      fakeFetch(message(JSON.stringify(reply)), captured),
    );
    // SYNTHETIC email; the PDF bytes are a placeholder.
    const result = await provider.extractEmail({
      from: 'Banco de prueba <avisos@banco.test>',
      subject: 'Tu resumen',
      text: 'Adjuntamos tu resumen.',
      pdfs: [{ name: 'resumen.pdf', base64: 'JVBERi0xLjQK' }],
      receivedOn: '2026-10-28',
    });
    expect(result.value).toEqual(reply);
    const body = captured[0]?.body as {
      output_config: { effort: string };
      messages: { content: { type: string; source?: { media_type: string } }[] }[];
    };
    expect(body.output_config.effort).toBe('medium');
    expect(body.messages[0]?.content.map((block) => block.type)).toEqual(['document', 'text']);
    expect(body.messages[0]?.content[0]?.source?.media_type).toBe('application/pdf');
  });

  it('reads a ticket photo as an image block with the category slugs in the schema', async () => {
    const captured: Captured[] = [];
    // SYNTHETIC ticket answer; the image bytes are a placeholder.
    const reply = {
      isReceipt: true,
      merchant: 'Almacén de prueba',
      cuit: null,
      issuedAt: '2026-10-10T15:00',
      total: '1500.00',
      currency: 'ARS',
      paymentMethodHint: null,
      items: [
        { name: 'Yerba', qty: '1', unitPrice: null, total: '1500.00', category: 'supermercado' },
      ],
    };
    const provider = new AnthropicLlmProvider(
      'k',
      'claude-opus-5',
      5000,
      5000,
      5000,
      fakeFetch(message(JSON.stringify(reply)), captured),
    );
    const result = await provider.extractReceipt({
      imageBase64: '/9j/4AAQ',
      mediaType: 'image/jpeg',
      categorySlugs: ['supermercado', 'otros'],
    });
    expect(result.value).toEqual(reply);
    const body = captured[0]?.body as {
      output_config: {
        format: {
          schema: {
            properties: { items: { items: { properties: { category: { enum: string[] } } } } };
          };
        };
      };
      messages: { content: { type: string }[] }[];
    };
    expect(body.messages[0]?.content.map((block) => block.type)).toEqual(['image', 'text']);
    expect(
      body.output_config.format.schema.properties.items.items.properties.category.enum,
    ).toEqual(['supermercado', 'otros']);
  });

  it('parses a typed entry with low effort and today in the prompt', async () => {
    const captured: Captured[] = [];
    const reply = {
      entries: [
        {
          amount: '8000',
          currency: 'ARS',
          direction: 'OUT',
          method: 'CASH',
          merchant: 'kiosco',
          category: 'comida',
          date: null,
        },
      ],
    };
    const provider = new AnthropicLlmProvider(
      'k',
      'claude-opus-5',
      5000,
      5000,
      5000,
      fakeFetch(message(JSON.stringify(reply)), captured),
    );
    const result = await provider.parseEntry({
      text: 'gasté 8 lucas en el kiosco',
      today: '2026-10-14',
      categorySlugs: ['comida'],
    });
    expect(result.value).toEqual(reply);
    const body = captured[0]?.body as {
      output_config: { effort: string };
      messages: { content: string }[];
    };
    expect(body.output_config.effort).toBe('low');
    expect(body.messages[0]?.content).toContain('Today: 2026-10-14');
  });
});
