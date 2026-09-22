import { describe, expect, it, vi } from 'vitest';

import { MailDeliveryError } from './mail.provider.js';
import { ResendMailProvider } from './resend-mail.provider.js';

const message = {
  to: 'mau@example.com',
  subject: '123456 es tu código de Findemes',
  text: 'Tu código es 123456',
};

describe('ResendMailProvider', () => {
  it('posts the message with the API key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"id":"x"}', { status: 200 }));
    const provider = new ResendMailProvider('re_key', 'Findemes <hola@findemes.app>', fetchImpl);
    await provider.send(message);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer re_key');
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Findemes <hola@findemes.app>',
      to: ['mau@example.com'],
      subject: message.subject,
      text: message.text,
    });
  });

  it('turns HTTP errors into MailDeliveryError without leaking the message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    const provider = new ResendMailProvider('re_key', 'a@b.co', fetchImpl);
    const error = await provider.send(message).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailDeliveryError);
    expect((error as MailDeliveryError).status).toBe(500);
    expect((error as Error).message).not.toContain('123456');
  });

  it('turns network failures into MailDeliveryError', async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('boom'), { name: 'TimeoutError' }));
    const provider = new ResendMailProvider('re_key', 'a@b.co', fetchImpl);
    await expect(provider.send(message)).rejects.toMatchObject({
      name: 'MailDeliveryError',
      status: null,
    });
  });
});
