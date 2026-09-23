import Anthropic from '@anthropic-ai/sdk';
import { Currency, PaymentMethod, TransactionDirection } from '@findemes/shared';
import { z } from 'zod';

import {
  type LlmProvider,
  type LlmResult,
  type NotificationExtraction,
  type NotificationExtractionInput,
} from './llm.provider.js';
import { NOTIFICATION_OUTPUT_SCHEMA, NOTIFICATION_SYSTEM_PROMPT } from './notification-prompt.js';

const ExtractionSchema = z.object({
  isFinancial: z.boolean(),
  amount: z.string().nullable(),
  currency: Currency.nullable(),
  direction: TransactionDirection.nullable(),
  method: PaymentMethod.nullable(),
  merchant: z.string().nullable(),
});

/** The model declined or answered something that does not fit the schema. */
export class LlmOutputError extends Error {
  override readonly name = 'LlmOutputError';
}

/**
 * Claude via the official SDK (ADR 010): structured output (JSON schema), low effort,
 * and server-side fallbacks so a classifier refusal is retried on the model Anthropic
 * recommends instead of failing. Never logs the text.
 */
export class AnthropicLlmProvider implements LlmProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(
    apiKey: string,
    private readonly model: string,
    timeoutMs: number,
    /** Tests only: intercept HTTP. */
    fetchImpl?: typeof fetch,
  ) {
    this.client = new Anthropic({
      apiKey,
      timeout: timeoutMs,
      maxRetries: 1,
      ...(fetchImpl ? { fetch: fetchImpl } : {}),
    });
  }

  /** Server-side fallbacks exist for the Opus 5 / Fable 5 generation only. */
  private get supportsFallbacks(): boolean {
    return /^claude-(opus-5|fable-5)/.test(this.model);
  }

  async extractNotification(
    input: NotificationExtractionInput,
  ): Promise<LlmResult<NotificationExtraction>> {
    const response = await this.client.beta.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: NOTIFICATION_SYSTEM_PROMPT,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: NOTIFICATION_OUTPUT_SCHEMA },
      },
      ...(this.supportsFallbacks
        ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
        : {}),
      messages: [
        {
          role: 'user',
          content: `Bank or wallet: ${input.sourceName}\n<notification>\n${input.text}\n</notification>`,
        },
      ],
    });

    const usage = {
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
    if (response.stop_reason === 'refusal') throw new LlmOutputError('refusal');
    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
    let value: NotificationExtraction;
    try {
      value = ExtractionSchema.parse(JSON.parse(text));
    } catch {
      throw new LlmOutputError('invalid_output');
    }
    return { value, ...usage };
  }
}
