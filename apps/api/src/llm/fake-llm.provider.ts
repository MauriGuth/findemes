import {
  type EmailExtraction,
  type EmailExtractionInput,
  type EntryParse,
  type EntryParseInput,
  type ReceiptExtraction,
  type ReceiptExtractionInput,
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

type ReceiptResponder = (
  input: ReceiptExtractionInput,
) => ReceiptExtraction | Error | Promise<ReceiptExtraction | Error>;
type EntryResponder = (input: EntryParseInput) => EntryParse | Error | Promise<EntryParse | Error>;

const NOT_A_RECEIPT: ReceiptExtraction = {
  isReceipt: false,
  merchant: null,
  cuit: null,
  issuedAt: null,
  total: null,
  currency: 'ARS',
  paymentMethodHint: null,
  items: [],
};

/** Test double: answers what the test tells it to and records the calls. */
export class FakeLlmProvider implements LlmProvider {
  readonly name = 'fake';
  readonly calls: NotificationExtractionInput[] = [];
  readonly emailCalls: EmailExtractionInput[] = [];
  private responder: Responder = () => NOT_FINANCIAL;
  private emailResponder: EmailResponder = () => EMAIL_NOT_FINANCIAL;
  readonly receiptCalls: ReceiptExtractionInput[] = [];
  readonly entryCalls: EntryParseInput[] = [];
  private receiptResponder: ReceiptResponder = () => NOT_A_RECEIPT;
  private entryResponder: EntryResponder = () => ({ entries: [] });

  respondToReceiptWith(responder: ReceiptResponder): void {
    this.receiptResponder = responder;
  }

  respondToEntryWith(responder: EntryResponder): void {
    this.entryResponder = responder;
  }

  async extractReceipt(input: ReceiptExtractionInput): Promise<LlmResult<ReceiptExtraction>> {
    this.receiptCalls.push(input);
    const value = await this.receiptResponder(input);
    if (value instanceof Error) throw value;
    return { value, model: 'fake-model', inputTokens: 1500, outputTokens: 300 };
  }

  async parseEntry(input: EntryParseInput): Promise<LlmResult<EntryParse>> {
    this.entryCalls.push(input);
    const value = await this.entryResponder(input);
    if (value instanceof Error) throw value;
    return { value, model: 'fake-model', inputTokens: 300, outputTokens: 60 };
  }

  respondWith(responder: Responder): void {
    this.responder = responder;
  }

  respondToEmailWith(responder: EmailResponder): void {
    this.emailResponder = responder;
  }

  reset(): void {
    this.calls.length = 0;
    this.emailCalls.length = 0;
    this.receiptCalls.length = 0;
    this.entryCalls.length = 0;
    this.responder = () => NOT_FINANCIAL;
    this.emailResponder = () => EMAIL_NOT_FINANCIAL;
    this.receiptResponder = () => NOT_A_RECEIPT;
    this.entryResponder = () => ({ entries: [] });
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
