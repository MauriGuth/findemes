import { Module } from '@nestjs/common';

import { DevicesController } from './devices.controller.js';
import { IngestAuthGuard } from './ingest-auth.guard.js';
import { IngestController } from './ingest.controller.js';
import { IngestProcessor } from './ingest.processor.js';
import { IngestService } from './ingest.service.js';
import { IngestTokenService } from './ingest-token.service.js';
import { RawEventCrypto } from './raw-event-crypto.js';
import { ShortcutService } from './shortcut.service.js';

@Module({
  controllers: [DevicesController, IngestController],
  providers: [
    RawEventCrypto,
    IngestTokenService,
    IngestAuthGuard,
    IngestService,
    IngestProcessor,
    ShortcutService,
  ],
  exports: [IngestTokenService, IngestProcessor, RawEventCrypto],
})
export class IngestModule {}
