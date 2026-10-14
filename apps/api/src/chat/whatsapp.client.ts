import { createHmac, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type Env } from '../config/env.schema.js';
import { MAX_IMAGE_BYTES } from '../storage/storage.service.js';

const GRAPH = 'https://graph.facebook.com/v23.0';

/**
 * WhatsApp Business Cloud API, Meta's official one (ADR 014). Unofficial clients that
 * drive a personal WhatsApp break its terms and get numbers banned: not used.
 */
@Injectable()
export class WhatsappClient {
  private readonly token: string | null;
  private readonly phoneNumberId: string | null;
  private readonly appSecret: string | null;
  readonly verifyToken: string | null;

  constructor(config: ConfigService<Env, true>) {
    this.token = config.get('WHATSAPP_ACCESS_TOKEN', { infer: true }) ?? null;
    this.phoneNumberId = config.get('WHATSAPP_PHONE_NUMBER_ID', { infer: true }) ?? null;
    this.appSecret = config.get('WHATSAPP_APP_SECRET', { infer: true }) ?? null;
    this.verifyToken = config.get('WHATSAPP_VERIFY_TOKEN', { infer: true }) ?? null;
  }

  get enabled(): boolean {
    return this.token !== null;
  }

  get ownPhoneNumberId(): string | null {
    return this.phoneNumberId;
  }

  /** X-Hub-Signature-256: HMAC-SHA256 of the exact bytes received, with the app secret. */
  verifySignature(rawBody: Buffer | undefined, header: string | undefined): boolean {
    if (!this.appSecret || !rawBody || !header?.startsWith('sha256=')) return false;
    const expected = Buffer.from(
      `sha256=${createHmac('sha256', this.appSecret).update(rawBody).digest('hex')}`,
    );
    const given = Buffer.from(header);
    return given.length === expected.length && timingSafeEqual(given, expected);
  }

  async sendText(to: string, body: string): Promise<void> {
    const response = await fetch(`${GRAPH}/${this.phoneNumberId ?? ''}/messages`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token ?? ''}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body, preview_url: false },
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`whatsapp_send_${String(response.status)}`);
  }

  async downloadMedia(mediaId: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const auth = { authorization: `Bearer ${this.token ?? ''}` };
    const meta = await fetch(`${GRAPH}/${mediaId}`, {
      headers: auth,
      signal: AbortSignal.timeout(15_000),
    });
    if (!meta.ok) throw new Error('whatsapp_media_failed');
    const info = (await meta.json()) as { url?: string; mime_type?: string; file_size?: number };
    if (!info.url || (info.file_size ?? 0) > MAX_IMAGE_BYTES)
      throw new Error('whatsapp_media_unavailable');
    const file = await fetch(info.url, { headers: auth, signal: AbortSignal.timeout(30_000) });
    if (!file.ok) throw new Error('whatsapp_media_failed');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error('whatsapp_media_too_large');
    return { bytes, contentType: info.mime_type ?? 'image/jpeg' };
  }
}
