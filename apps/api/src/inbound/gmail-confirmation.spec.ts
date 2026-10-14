import { describe, expect, it } from 'vitest';

import { extractGmailConfirmation, isGmailForwardingConfirmation } from './gmail-confirmation.js';

// SYNTHETIC texts written for the test, not copies of Google's email.
describe('Gmail forwarding confirmation', () => {
  it('recognizes the sender only from google.com', () => {
    expect(
      isGmailForwardingConfirmation(
        'Gmail Team <forwarding-noreply@google.com>',
        'Gmail Forwarding Confirmation',
      ),
    ).toBe(true);
    expect(
      isGmailForwardingConfirmation('Equipo <forwarding-noreply@g00gle.com>', 'Forwarding'),
    ).toBe(false);
    expect(isGmailForwardingConfirmation('Banco <avisos@banco.test>', 'Resumen')).toBe(false);
  });

  it('pulls the code and the link when present', () => {
    expect(
      extractGmailConfirmation(
        'Confirmation code: 123456789\nTo confirm, click https://mail-settings.google.com/mail/vf-abc123.',
      ),
    ).toEqual({ code: '123456789', link: 'https://mail-settings.google.com/mail/vf-abc123' });
    expect(extractGmailConfirmation('nada útil')).toEqual({ code: null, link: null });
  });
});
