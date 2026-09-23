import {
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

/** Test double: answers what the test tells it to and records the calls. */
export class FakeLlmProvider implements LlmProvider {
  readonly name = 'fake';
  readonly calls: NotificationExtractionInput[] = [];
  private responder: Responder = () => NOT_FINANCIAL;

  respondWith(responder: Responder): void {
    this.responder = responder;
  }

  reset(): void {
    this.calls.length = 0;
    this.responder = () => NOT_FINANCIAL;
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
