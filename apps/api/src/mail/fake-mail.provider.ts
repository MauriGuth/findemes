import { type MailMessage, type MailProvider } from './mail.provider.js';

/** Tests only: keeps every message in memory and lets the test read the code back. */
export class FakeMailProvider implements MailProvider {
  readonly sent: MailMessage[] = [];
  failNext = false;

  send(message: MailMessage): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.reject(new Error('fake mail failure'));
    }
    this.sent.push(message);
    return Promise.resolve();
  }

  /** Six-digit codes sent to `to`, newest first. */
  codesFor(to: string): string[] {
    return this.sent
      .filter((m) => m.to === to)
      .map((m) => /\b(\d{6})\b/.exec(m.subject)?.[1])
      .filter((code): code is string => code !== undefined)
      .reverse();
  }

  lastCodeFor(to: string): string | undefined {
    return this.codesFor(to)[0];
  }

  clear(): void {
    this.sent.length = 0;
  }
}
