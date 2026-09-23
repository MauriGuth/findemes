import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { type IngestConfig, type IngestNotification, type IngestResult } from '@findemes/shared';

import { CLOCK, type Clock } from '../common/clock.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CAPTURE_UNAVAILABLE, RawEventCrypto } from './raw-event-crypto.js';
import { IngestProcessor, type NotificationPayload } from './ingest.processor.js';
import { type IngestDevice } from './ingest-token.service.js';

const RAW_EVENT_TTL_MS = 30 * 86_400_000;

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: RawEventCrypto,
    private readonly processor: IngestProcessor,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private async whitelistMap(): Promise<Map<string, string>> {
    const sources = await this.prisma.source.findMany({
      where: { active: true, packageName: { not: null } },
      select: { id: true, packageName: true },
    });
    return new Map(sources.map((s) => [s.packageName ?? '', s.id]));
  }

  private async touch(device: IngestDevice): Promise<void> {
    await this.prisma.device.update({
      where: { id: device.deviceId },
      data: { lastIngestAt: this.clock.now(), listenerEnabled: true },
    });
  }

  async config(device: IngestDevice): Promise<IngestConfig> {
    await this.touch(device);
    return { packages: [...(await this.whitelistMap()).keys()].sort() };
  }

  /**
   * Stores each whitelisted notification encrypted and processes it right away (ADR 005:
   * synchronous). Anything outside the whitelist is dropped without being stored, even if a
   * modified client sends it. A repeated notification is a no-op, except that a FAILED one
   * is processed again: that is the retry path.
   */
  async ingest(device: IngestDevice, items: IngestNotification[]): Promise<IngestResult> {
    if (!this.crypto.enabled) {
      throw new ServiceUnavailableException({ message: CAPTURE_UNAVAILABLE });
    }
    const now = this.clock.now();
    await this.prisma.rawEvent.deleteMany({ where: { expiresAt: { lt: now } } });
    const whitelist = await this.whitelistMap();
    const result: IngestResult = { accepted: 0, duplicates: 0, rejected: 0 };
    const handled = new Set<string>();

    for (const item of items) {
      if (!whitelist.has(item.packageName)) {
        result.rejected += 1;
        continue;
      }
      const payload: NotificationPayload = {
        title: item.title ?? null,
        text: item.text ?? null,
        bigText: item.bigText ?? null,
        subText: item.subText ?? null,
      };
      const postedAt = new Date(item.postedAt);
      try {
        const row = await this.prisma.rawEvent.create({
          data: {
            userId: device.userId,
            deviceId: device.deviceId,
            channel: 'ANDROID_NOTIFICATION',
            packageName: item.packageName,
            externalKey: item.key,
            postedAt,
            ...this.crypto.encrypt(device.userId, payload),
            status: 'RECEIVED',
            expiresAt: new Date(now.getTime() + RAW_EVENT_TTL_MS),
          },
          select: { id: true },
        });
        result.accepted += 1;
        handled.add(row.id);
        await this.processor.process(row.id);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        result.duplicates += 1;
        const existing = await this.prisma.rawEvent.findFirst({
          where: { deviceId: device.deviceId, externalKey: item.key, postedAt },
          select: { id: true, status: true },
        });
        if (existing?.status === 'FAILED') {
          handled.add(existing.id);
          await this.processor.process(existing.id);
        }
      }
    }

    // Retry path for events that failed earlier (LLM timeout, transient DB error): a few per
    // upload, never the ones this batch just handled.
    const failed = await this.prisma.rawEvent.findMany({
      where: {
        userId: device.userId,
        status: 'FAILED',
        id: { notIn: [...handled] },
        receivedAt: { gt: new Date(now.getTime() - 86_400_000) },
      },
      orderBy: { receivedAt: 'asc' },
      take: 5,
      select: { id: true },
    });
    for (const event of failed) await this.processor.process(event.id);

    await this.touch(device);
    this.logger.log(
      `ingest.batch accepted=${String(result.accepted)} duplicates=${String(result.duplicates)} rejected=${String(result.rejected)}`,
    );
    return result;
  }
}
