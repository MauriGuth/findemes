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
  /** Calls running right now per user: parallel requests must not all pass the cap. */
  private readonly inflight = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
    config: ConfigService<Env, true>,
  ) {
    this.cap = config.get('ASSIST_LLM_DAILY_CAP', { infer: true });
  }

  /**
   * Takes a slot under the daily cap, or null when it is used up. Call the returned
   * function when the Claude call ended (after record()).
   */
  async acquire(userId: string): Promise<(() => void) | null> {
    // Reserve first, then count: concurrent requests see each other's reservations.
    this.inflight.set(userId, (this.inflight.get(userId) ?? 0) + 1);
    const release = () => {
      const left = (this.inflight.get(userId) ?? 1) - 1;
      if (left <= 0) this.inflight.delete(userId);
      else this.inflight.set(userId, left);
    };
    if (await this.available(userId, (this.inflight.get(userId) ?? 1) - 1)) return release;
    release();
    return null;
  }

  /** Failed calls don't count, as with notifications (ADR 010). */
  async available(userId: string, pending = 0): Promise<boolean> {
    const today = dayRange(todayInArt(this.clock.now()));
    const used = await this.prisma.llmUsage.count({
      where: {
        userId,
        purpose: { in: ['receipt', 'entry'] },
        createdAt: { gte: today.start, lt: today.end },
        outcome: { not: 'error' },
      },
    });
    return used + pending < this.cap;
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
