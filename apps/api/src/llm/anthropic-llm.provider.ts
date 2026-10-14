import Anthropic from '@anthropic-ai/sdk';
import { type BetaContentBlockParam } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { BillKind, Currency, PaymentMethod, TransactionDirection } from '@findemes/shared';
import { z } from 'zod';

import { EMAIL_OUTPUT_SCHEMA, EMAIL_SYSTEM_PROMPT } from './email-prompt.js';
import { ENTRY_SYSTEM_PROMPT, entryOutputSchema } from './entry-prompt.js';
import {
  type EmailExtraction,
  type EmailExtractionInput,
  type EntryParse,
  type EntryParseInput,
  type ReceiptExtraction,
  type ReceiptExtractionInput,
  LlmRejectedError,
  type LlmProvider,
  type LlmResult,
  type NotificationExtraction,
  type NotificationExtractionInput,
} from './llm.provider.js';
import { NOTIFICATION_OUTPUT_SCHEMA, NOTIFICATION_SYSTEM_PROMPT } from './notification-prompt.js';
import { RECEIPT_SYSTEM_PROMPT, receiptOutputSchema } from './receipt-prompt.js';

const ExtractionSchema = z.object({
  isFinancial: z.boolean(),
  amount: z.string().nullable(),
  currency: Currency.nullable(),
  direction: TransactionDirection.nullable(),
  method: PaymentMethod.nullable(),
  merchant: z.string().nullable(),
});

const EmailSchema = z.object({
  kind: z.enum(['movement', 'card_statement', 'bill', 'not_financial']),
  movement: z
    .object({
      amount: z.string(),
      currency: Currency,
      direction: TransactionDirection,
      method: PaymentMethod,
      merchant: z.string().nullable(),
      occurredAt: z.string().nullable(),
    })
    .nullable(),
  statement: z
    .object({
      issuer: z.string(),
      total: z.string(),
      minimum: z.string().nullable(),
      currency: Currency,
      dueOn: z.string(),
    })
    .nullable(),
  bill: z
    .object({
      issuer: z.string(),
      kind: BillKind.exclude(['CARD_STATEMENT']),
      amount: z.string(),
      currency: Currency,
      dueOn: z.string(),
      periodMonth: z.string().nullable(),
    })
    .nullable(),
});

const ReceiptSchema = z.object({
  isReceipt: z.boolean(),
  merchant: z.string().nullable(),
  cuit: z.string().nullable(),
  issuedAt: z.string().nullable(),
  total: z.string().nullable(),
  currency: Currency,
  paymentMethodHint: PaymentMethod.nullable(),
  items: z.array(
    z.object({
      name: z.string(),
      qty: z.string(),
      unitPrice: z.string().nullable(),
      total: z.string(),
      category: z.string(),
    }),
  ),
});

const EntrySchema = z.object({
  entries: z.array(
    z.object({
      amount: z.string(),
      currency: Currency,
      direction: TransactionDirection,
      method: PaymentMethod,
      merchant: z.string().nullable(),
      category: z.string(),
      date: z.string().nullable(),
    }),
  ),
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
    /** Emails carry PDFs and take longer than notifications. */
    private readonly emailTimeoutMs: number = timeoutMs,
    /** Photos too. */
    private readonly receiptTimeoutMs: number = timeoutMs,
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
    return this.structured(
      NOTIFICATION_SYSTEM_PROMPT,
      NOTIFICATION_OUTPUT_SCHEMA,
      'low',
      `Bank or wallet: ${input.sourceName}\n<notification>\n${input.text}\n</notification>`,
      ExtractionSchema,
    );
  }

  async extractEmail(input: EmailExtractionInput): Promise<LlmResult<EmailExtraction>> {
    const documents: BetaContentBlockParam[] = input.pdfs.map((pdf) => ({
      type: 'document',
      title: pdf.name,
      source: { type: 'base64', media_type: 'application/pdf', data: pdf.base64 },
    }));
    return this.structured(
      EMAIL_SYSTEM_PROMPT,
      EMAIL_OUTPUT_SCHEMA,
      'medium',
      [
        ...documents,
        {
          type: 'text',
          text: `Received: ${input.receivedOn}\nFrom: ${input.from}\nSubject: ${input.subject}\n<email>\n${input.text}\n</email>`,
        },
      ],
      EmailSchema,
      this.emailTimeoutMs,
    );
  }

  async extractReceipt(input: ReceiptExtractionInput): Promise<LlmResult<ReceiptExtraction>> {
    return this.structured(
      RECEIPT_SYSTEM_PROMPT,
      receiptOutputSchema(input.categorySlugs),
      'medium',
      [
        {
          type: 'image',
          source: { type: 'base64', media_type: input.mediaType, data: input.imageBase64 },
        },
        { type: 'text', text: 'Read this ticket.' },
      ],
      ReceiptSchema,
      this.receiptTimeoutMs,
      4096,
    );
  }

  async parseEntry(input: EntryParseInput): Promise<LlmResult<EntryParse>> {
    return this.structured(
      ENTRY_SYSTEM_PROMPT,
      entryOutputSchema(input.categorySlugs),
      'low',
      `Today: ${input.today}\n<message>\n${input.text}\n</message>`,
      EntrySchema,
    );
  }

  private async structured<T>(
    system: string,
    schema: Record<string, unknown>,
    effort: 'low' | 'medium',
    content: string | BetaContentBlockParam[],
    parser: z.ZodType<T>,
    timeoutMs?: number,
    maxTokens = 2048,
  ): Promise<LlmResult<T>> {
    const request = this.client.beta.messages.create(
      {
        model: this.model,
        max_tokens: maxTokens,
        system,
        output_config: { effort, format: { type: 'json_schema', schema } },
        ...(this.supportsFallbacks
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {}),
        messages: [{ role: 'user', content }],
      },
      timeoutMs ? { timeout: timeoutMs } : undefined,
    );
    let response: Awaited<typeof request>;
    try {
      response = await request;
    } catch (error) {
      // 400 (bad or encrypted document), 413 (too large), 422: the same input always fails.
      const status = error instanceof Anthropic.APIError ? Number(error.status) : 0;
      if ([400, 413, 422].includes(status)) throw new LlmRejectedError(`status_${String(status)}`);
      throw error;
    }

    const usage = {
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
    if (response.stop_reason === 'refusal') throw new LlmOutputError('refusal');
    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');
    let value: T;
    try {
      value = parser.parse(JSON.parse(text));
    } catch {
      throw new LlmOutputError('invalid_output');
    }
    return { value, ...usage };
  }
}
