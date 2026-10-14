import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { formatIsoDate, todayInArt } from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { isoToDate } from '../common/dto.js';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Marks a user active today, once per day per process (ADR 017): what weekly retention is
 * measured from. Never blocks or fails the request.
 */
@Injectable()
export class ActivityService {
  private readonly seen = new Set<string>();
  private seenDay = '';

  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  touch(userId: string): void {
    const day = formatIsoDate(todayInArt(this.clock.now()));
    if (day !== this.seenDay) {
      this.seen.clear();
      this.seenDay = day;
    }
    if (this.seen.has(userId)) return;
    this.seen.add(userId);
    void this.prisma.activityDay
      .upsert({
        where: { userId_day: { userId, day: isoToDate(day) } },
        create: { userId, day: isoToDate(day) },
        update: {},
      })
      .catch(() => this.seen.delete(userId));
  }
}

@Global()
@Module({ providers: [ActivityService], exports: [ActivityService] })
export class ActivityModule {}
