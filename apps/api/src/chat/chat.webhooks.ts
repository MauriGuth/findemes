import { timingSafeEqual } from 'node:crypto';

import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Injectable,
  Logger,
  NotFoundException,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { z } from 'zod';

import { Public } from '../auth/public.decorator.js';
import { type Env } from '../config/env.schema.js';
import { ChatService, type IncomingChatMessage } from './chat.service.js';
import { TelegramClient } from './telegram.client.js';
import { WhatsappClient } from './whatsapp.client.js';

/** Webhooks answer at once; the conversation runs after, so a slow ticket never times out. */
@Injectable()
export class ChatRunner {
  private readonly logger = new Logger(ChatRunner.name);
  private readonly inflight = new Set<Promise<void>>();

  constructor(private readonly chat: ChatService) {}

  async drain(): Promise<void> {
    while (this.inflight.size > 0) await Promise.allSettled([...this.inflight]);
  }

  run(message: IncomingChatMessage, reply: (text: string) => Promise<void>): void {
    const work = (async () => {
      const text = await this.chat.handle(message);
      if (text) await reply(text);
    })()
      .catch(() => this.logger.error(`chat.reply_failed channel=${message.channel}`))
      .finally(() => this.inflight.delete(work));
    this.inflight.add(work);
  }
}

const TelegramUpdateSchema = z.looseObject({
  update_id: z.number(),
  message: z
    .looseObject({
      message_id: z.number(),
      chat: z.looseObject({ id: z.number(), type: z.string() }),
      text: z.string().optional(),
      caption: z.string().optional(),
      photo: z
        .array(z.looseObject({ file_id: z.string(), file_size: z.number().optional() }))
        .optional(),
      document: z.looseObject({ file_id: z.string(), mime_type: z.string().optional() }).optional(),
      voice: z.unknown().optional(),
      audio: z.unknown().optional(),
    })
    .optional(),
});
type TelegramUpdate = z.infer<typeof TelegramUpdateSchema>;

const WhatsappWebhookSchema = z.looseObject({
  entry: z
    .array(
      z.looseObject({
        changes: z.array(
          z.looseObject({
            value: z.looseObject({
              metadata: z.looseObject({ phone_number_id: z.string() }).optional(),
              messages: z
                .array(
                  z.looseObject({
                    from: z.string(),
                    id: z.string(),
                    type: z.string(),
                    text: z.looseObject({ body: z.string() }).optional(),
                    image: z.looseObject({ id: z.string() }).optional(),
                  }),
                )
                .optional(),
            }),
          }),
        ),
      }),
    )
    .default([]),
});
type WhatsappWebhook = z.infer<typeof WhatsappWebhookSchema>;

/** Telegram and WhatsApp webhooks. Not part of the app's API, so not in Swagger. */
@ApiExcludeController()
@Controller('chat')
export class ChatWebhooksController {
  private readonly telegramSecret: Buffer | null;

  constructor(
    private readonly runner: ChatRunner,
    private readonly telegram: TelegramClient,
    private readonly whatsapp: WhatsappClient,
    config: ConfigService<Env, true>,
  ) {
    const secret = config.get('TELEGRAM_WEBHOOK_SECRET', { infer: true });
    this.telegramSecret = secret ? Buffer.from(secret) : null;
  }

  @Post('telegram')
  @Public()
  @SkipThrottle()
  @HttpCode(200)
  telegramWebhook(
    @Headers('x-telegram-bot-api-secret-token') secret: string | undefined,
    @Body({ schema: TelegramUpdateSchema }) update: TelegramUpdate,
  ): { ok: true } {
    if (!this.telegram.enabled || !this.telegramSecret) throw new NotFoundException();
    const given = Buffer.from(secret ?? '');
    if (
      given.length !== this.telegramSecret.length ||
      !timingSafeEqual(given, this.telegramSecret)
    ) {
      throw new UnauthorizedException();
    }
    const message = update.message;
    // Only one-to-one chats with the bot: never groups.
    if (!message || message.chat.type !== 'private') return { ok: true };
    const chatId = String(message.chat.id);
    const photo =
      message.photo?.at(-1)?.file_id ??
      (message.document?.mime_type?.startsWith('image/') ? message.document.file_id : undefined);
    this.runner.run(
      {
        channel: 'TELEGRAM',
        externalId: chatId,
        messageId: String(message.message_id),
        kind: photo
          ? 'image'
          : message.voice || message.audio
            ? 'audio'
            : message.text
              ? 'text'
              : 'other',
        text: message.text ?? message.caption ?? null,
        ...(photo ? { fetchImage: () => this.telegram.downloadFile(photo) } : {}),
      },
      (text) => this.telegram.sendMessage(chatId, text),
    );
    return { ok: true };
  }

  /** Meta's one-time verification when the webhook is configured. */
  @Get('whatsapp')
  @Public()
  @SkipThrottle()
  whatsappVerify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
  ): string {
    if (!this.whatsapp.enabled || !this.whatsapp.verifyToken) throw new NotFoundException();
    if (mode !== 'subscribe' || token !== this.whatsapp.verifyToken || !challenge) {
      throw new ForbiddenException();
    }
    return challenge;
  }

  @Post('whatsapp')
  @Public()
  @SkipThrottle()
  @HttpCode(200)
  whatsappWebhook(
    @Req() req: { rawBody?: Buffer },
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body({ schema: WhatsappWebhookSchema }) body: WhatsappWebhook,
  ): { ok: true } {
    if (!this.whatsapp.enabled) throw new NotFoundException();
    if (!this.whatsapp.verifySignature(req.rawBody, signature)) throw new UnauthorizedException();
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        const ours = change.value.metadata?.phone_number_id === this.whatsapp.ownPhoneNumberId;
        if (!ours) continue;
        for (const message of change.value.messages ?? []) {
          const imageId = message.image?.id;
          this.runner.run(
            {
              channel: 'WHATSAPP',
              externalId: message.from,
              messageId: message.id,
              kind: imageId
                ? 'image'
                : message.type === 'audio'
                  ? 'audio'
                  : message.text
                    ? 'text'
                    : 'other',
              text: message.text?.body ?? null,
              ...(imageId ? { fetchImage: () => this.whatsapp.downloadMedia(imageId) } : {}),
            },
            (text) => this.whatsapp.sendText(message.from, text),
          );
        }
      }
    }
    return { ok: true };
  }
}
