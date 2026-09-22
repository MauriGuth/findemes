import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type Env } from '../config/env.schema.js';
import { ConsoleMailProvider } from './console-mail.provider.js';
import { FakeMailProvider } from './fake-mail.provider.js';
import { MAIL_PROVIDER, type MailProvider } from './mail.provider.js';
import { ResendMailProvider } from './resend-mail.provider.js';

@Global()
@Module({
  providers: [
    {
      provide: MAIL_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): MailProvider => {
        switch (config.get('MAIL_PROVIDER', { infer: true })) {
          case 'resend':
            return new ResendMailProvider(
              config.get('RESEND_API_KEY', { infer: true }) ?? '',
              config.get('MAIL_FROM', { infer: true }) ?? '',
            );
          case 'fake':
            return new FakeMailProvider();
          default:
            return new ConsoleMailProvider();
        }
      },
    },
  ],
  exports: [MAIL_PROVIDER],
})
export class MailModule {}
