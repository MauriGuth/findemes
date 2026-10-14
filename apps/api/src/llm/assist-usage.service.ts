import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { dayRange, todayInArt } from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { type Env } from '../config/env.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { costMicros } from './llm.provider.js';

/** Claude calls the user asks for directly: tickets and typed or chat entries (ADR 014). */
export type AssistPurpose = 'receipt' | 'entry';

export const ASSIST_CAP_MESSAGE =
  'Llegaste al límite de lecturas con IA de hoy. Mañana vas a poder seguir; mientras, cargalo a mano.';

/** The shared daily cap for assist calls, and the LlmUsage row every call leaves. */
@Injectable()
export class AssistUsageService {
  private readonly cap: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    this.cap = config.get('ASSIST_LLM_DAILY_CAP', { infer: true });
  }

  /** Failed calls don't count, as with notifications (ADR 010). */
  async available(userId: string): Promise<boolean> {
    const today = dayRange(todayInArt(this.clock.now()));
    const used = await this.prisma.llmUsage.count({
      where: {
        userId,
        purpose: { in: ['receipt', 'entry'] },
        createdAt: { gte: today.start, lt: today.end },
        outcome: { not: 'error' },
      },
    });
    return used < this.cap;
  }

  async record(
    userId: string,
    purpose: AssistPurpose,
    outcome: 'parsed' | 'not_financial' | 'error',
    usage: { model: string; inputTokens: number; outputTokens: number },
  ): Promise<void> {
    await this.prisma.llmUsage.create({
      data: {
        userId,
        purpose,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costMicros: costMicros(usage.model, usage.inputTokens, usage.outputTokens),
        outcome,
        createdAt: this.clock.now(),
      },
    });
  }
}
