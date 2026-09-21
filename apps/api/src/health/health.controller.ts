import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  type HealthIndicatorResult,
  PrismaHealthIndicator,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';

import { PrismaService } from '../prisma/prisma.service.js';
import { APP_VERSION } from '../version.js';

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  /** Liveness + readiness: the process is up and the database answers. Used by Railway. */
  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Health check (process + database)' })
  check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', this.prisma),
      () =>
        Promise.resolve<HealthIndicatorResult>({
          app: { status: 'up', version: APP_VERSION, uptimeSeconds: Math.round(process.uptime()) },
        }),
    ]);
  }
}
