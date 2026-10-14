import {
  type EmailExtraction,
  type EmailExtractionInput,
  type LlmProvider,
  type LlmResult,
  type NotificationExtraction,
  type NotificationExtractionInput,
} from './llm.provider.js';

type Responder = (
  input: NotificationExtractionInput,
) => NotificationExtraction | Error | Promise<NotificationExtraction | Error>;

const NOT_FINANCIAL: NotificationExtraction = {
  isFinancial: false,
  amount: null,
  currency: null,
  direction: null,
  method: null,
  merchant: null,
};

type EmailResponder = (
  input: EmailExtractionInput,
) => EmailExtraction | Error | Promise<EmailExtraction | Error>;

const EMAIL_NOT_FINANCIAL: EmailExtraction = {
  kind: 'not_financial',
  movement: null,
  statement: null,
  bill: null,
};

/** Test double: answers what the test tells it to and records the calls. */
export class FakeLlmProvider implements LlmProvider {
  readonly name = 'fake';
  readonly calls: NotificationExtractionInput[] = [];
  readonly emailCalls: EmailExtractionInput[] = [];
  private responder: Responder = () => NOT_FINANCIAL;
  private emailResponder: EmailResponder = () => EMAIL_NOT_FINANCIAL;

  respondWith(responder: Responder): void {
    this.responder = responder;
  }

  respondToEmailWith(responder: EmailResponder): void {
    this.emailResponder = responder;
  }

  reset(): void {
    this.calls.length = 0;
    this.emailCalls.length = 0;
    this.responder = () => NOT_FINANCIAL;
    this.emailResponder = () => EMAIL_NOT_FINANCIAL;
  }

  async extractEmail(input: EmailExtractionInput): Promise<LlmResult<EmailExtraction>> {
    this.emailCalls.push(input);
    const value = await this.emailResponder(input);
    if (value instanceof Error) throw value;
    return { value, model: 'fake-model', inputTokens: 900, outputTokens: 80 };
  }

  async extractNotification(
    input: NotificationExtractionInput,
  ): Promise<LlmResult<NotificationExtraction>> {
    this.calls.push(input);
    const value = await this.responder(input);
    if (value instanceof Error) throw value;
    return { value, model: 'fake-model', inputTokens: 100, outputTokens: 40 };
  }
}
