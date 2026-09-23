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
      fakeFetch(message('', 'refusal'), []),
    );
    await expect(refusal.extractNotification(input)).rejects.toBeInstanceOf(LlmOutputError);
    const garbage = new AnthropicLlmProvider(
      'k',
      'claude-opus-5',
      5000,
      fakeFetch(message('{"isFinancial": "maybe"}'), []),
    );
    await expect(garbage.extractNotification(input)).rejects.toBeInstanceOf(LlmOutputError);
  });
});
