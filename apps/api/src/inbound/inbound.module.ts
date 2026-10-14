import { Module, type OnApplicationShutdown } from '@nestjs/common';

import { IngestModule } from '../ingest/ingest.module.js';
import { EmailIngestService } from './email-ingest.service.js';
import { EmailProcessor } from './email.processor.js';
import { InboundAddressService } from './inbound-address.service.js';
import { InboundAuthGuard } from './inbound-auth.guard.js';
import { InboundAddressController, InboundWebhookController } from './inbound.controller.js';

@Module({
  imports: [IngestModule],
  controllers: [InboundWebhookController, InboundAddressController],
  providers: [InboundAddressService, InboundAuthGuard, EmailIngestService, EmailProcessor],
})
export class InboundModule implements OnApplicationShutdown {
  constructor(private readonly emails: EmailIngestService) {}

  /** Let a deploy finish the emails being read before the process exits. */
  async onApplicationShutdown(): Promise<void> {
    await this.emails.drain();
  }
}
