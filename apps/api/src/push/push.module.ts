import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type Env } from '../config/env.schema.js';
import { AlertsService } from './alerts.service.js';
import { ExpoPushSender, FakePushSender, PUSH_SENDER, type PushSender } from './push.sender.js';

@Global()
@Module({
  providers: [
    {
      provide: PUSH_SENDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PushSender | null => {
        switch (config.get('PUSH_PROVIDER', { infer: true })) {
          case 'expo':
            return new ExpoPushSender(config.get('EXPO_ACCESS_TOKEN', { infer: true }));
          case 'fake':
            return new FakePushSender();
          default:
            return null;
        }
      },
    },
    AlertsService,
  ],
  exports: [AlertsService, PUSH_SENDER],
})
export class PushModule {}
