import { Logger } from '@nestjs/common';

import { type MailMessage, type MailProvider } from './mail.provider.js';

/** Development only: prints the whole message (login code included) to the API console. */
export class ConsoleMailProvider implements MailProvider {
  private readonly logger = new Logger('Mail');

  send(message: MailMessage): Promise<void> {
    this.logger.warn(
      `\n──── mail to ${message.to} ────\n${message.subject}\n\n${message.text}\n────────────────────────────`,
    );
    return Promise.resolve();
  }
}
