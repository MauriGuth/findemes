import { Module } from '@nestjs/common';

import { EntriesModule } from '../entries/entries.module.js';
import { ReceiptsModule } from '../receipts/receipts.module.js';
import { ChatLinkController } from './chat.controller.js';
import { ChatLinkService } from './chat-link.service.js';
import { ChatService } from './chat.service.js';
import { ChatRunner, ChatWebhooksController } from './chat.webhooks.js';
import { TelegramClient } from './telegram.client.js';
import { WhatsappClient } from './whatsapp.client.js';

@Module({
  imports: [EntriesModule, ReceiptsModule],
  controllers: [ChatLinkController, ChatWebhooksController],
  providers: [ChatLinkService, ChatService, ChatRunner, TelegramClient, WhatsappClient],
})
export class ChatModule {}
