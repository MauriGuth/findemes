import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type Env } from '../config/env.schema.js';
import { MAX_IMAGE_BYTES } from '../storage/storage.service.js';

/**
 * The official Telegram Bot API (ADR 014), with plain fetch. The bot token never leaves
 * the server and is never logged (it is part of every URL, so URLs are never logged).
 */
@Injectable()
export class TelegramClient implements OnApplicationBootstrap {
  private readonly logger = new Logger(TelegramClient.name);
  private readonly token: string | null;

  constructor(private readonly config: ConfigService<Env, true>) {
    this.token = config.get('TELEGRAM_BOT_TOKEN', { infer: true }) ?? null;
  }

  get enabled(): boolean {
    return this.token !== null;
  }

  private async call<T>(method: string, body: object): Promise<T> {
    const response = await fetch(`https://api.telegram.org/bot${this.token ?? ''}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await response.json()) as { ok: boolean; result?: T; description?: string };
    if (!json.ok || json.result === undefined) throw new Error(`telegram_${method}_failed`);
    return json.result;
  }

  /** Registers the webhook on boot when the public URL is known; never blocks the boot. */
  async onApplicationBootstrap(): Promise<void> {
    const base = this.config.get('API_PUBLIC_URL', { infer: true });
    if (!this.token || !base || this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    try {
      await this.call('setWebhook', {
        url: `${base.replace(/\/+$/, '')}/chat/telegram`,
        secret_token: this.config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true }),
        allowed_updates: ['message'],
        drop_pending_updates: false,
      });
      this.logger.log('telegram.webhook_set');
    } catch {
      this.logger.warn('telegram.webhook_failed');
    }
  }

  async sendMessage(chatId: string, text: string): Promise<void> {
    await this.call('sendMessage', { chat_id: chatId, text });
  }

  async downloadFile(fileId: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const file = await this.call<{ file_path?: string; file_size?: number }>('getFile', {
      file_id: fileId,
    });
    if (!file.file_path || (file.file_size ?? 0) > MAX_IMAGE_BYTES) {
      throw new Error('telegram_file_unavailable');
    }
    const response = await fetch(
      `https://api.telegram.org/file/bot${this.token ?? ''}/${file.file_path}`,
      { signal: AbortSignal.timeout(30_000) },
    );
    if (!response.ok) throw new Error('telegram_file_failed');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error('telegram_file_too_large');
    return { bytes, contentType: file.file_path.endsWith('.png') ? 'image/png' : 'image/jpeg' };
  }
}
