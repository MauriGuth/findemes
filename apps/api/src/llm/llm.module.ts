import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type Env } from '../config/env.schema.js';
import { AnthropicLlmProvider } from './anthropic-llm.provider.js';
import { FakeLlmProvider } from './fake-llm.provider.js';
import { LLM_PROVIDER, type LlmProvider } from './llm.provider.js';

@Global()
@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): LlmProvider | null => {
        switch (config.get('LLM_PROVIDER', { infer: true })) {
          case 'anthropic':
            return new AnthropicLlmProvider(
              config.get('ANTHROPIC_API_KEY', { infer: true }) ?? '',
              config.get('LLM_MODEL', { infer: true }),
              config.get('LLM_TIMEOUT_MS', { infer: true }),
            );
          case 'fake':
            return new FakeLlmProvider();
          default:
            return null;
        }
      },
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
