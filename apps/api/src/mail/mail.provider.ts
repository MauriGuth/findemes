export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailProvider {
  send(message: MailMessage): Promise<void>;
}

export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

/** The provider could not hand the message to the mail service. Never carries the message body. */
export class MailDeliveryError extends Error {
  override readonly name = 'MailDeliveryError';

  constructor(
    readonly provider: string,
    readonly status: number | null,
    message: string,
  ) {
    super(message);
  }
}
