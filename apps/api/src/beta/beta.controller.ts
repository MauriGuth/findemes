import { timingSafeEqual } from 'node:crypto';

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiExcludeController, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import {
  type DismissRecurringInput,
  DismissRecurringSchema,
  type ExportQuery,
  ExportQuerySchema,
  formatIsoDate,
  type RecurringSuggestion,
  RecurringSuggestionListSchema,
  todayInArt,
} from '@findemes/shared';

import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import { type Env } from '../config/env.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BetaService, MAX_EXPORT_MONTHS } from './beta.service.js';
import { DELETE_ACCOUNT_SCRIPT, deleteAccountPage, privacyPage } from './legal.pages.js';
import { mondayOf, type RetentionCohort, weeklyRetention } from './retention.js';

// Not under /commitments: its /:id route would catch "suggestions".
@ApiTags('commitments')
@ApiBearerAuth()
@Controller('suggestions/commitments')
export class RecurringController {
  constructor(private readonly beta: BetaService) {}

  /** Payments that look monthly and could be a commitment. */
  @Get()
  @ApiOkResponse({ standardSchema: RecurringSuggestionListSchema })
  async list(@CurrentUser() user: AuthUser): Promise<{ items: RecurringSuggestion[] }> {
    return { items: await this.beta.suggestions(user.id) };
  }

  /** "No es fijo": never suggest it again. */
  @Post('dismiss')
  @HttpCode(204)
  async dismiss(
    @CurrentUser() user: AuthUser,
    @Body({ schema: DismissRecurringSchema }) body: DismissRecurringInput,
  ): Promise<void> {
    await this.beta.dismiss(user.id, body.key);
  }
}

@ApiTags('exports')
@ApiBearerAuth()
@Controller('exports')
export class ExportController {
  constructor(private readonly beta: BetaService) {}

  /** Movements from period `from` to `to` (inclusive, up to 24) as CSV (";", decimal comma). */
  @Get('transactions.csv')
  @Header('content-type', 'text/csv; charset=utf-8')
  @Header('cache-control', 'no-store')
  async transactions(
    @CurrentUser() user: AuthUser,
    @Query({ schema: ExportQuerySchema }) query: ExportQuery,
  ): Promise<string> {
    if (!BetaService.validRange(query)) {
      throw new BadRequestException(
        `Elegí de 1 a ${String(MAX_EXPORT_MONTHS)} meses, del más viejo al más nuevo.`,
      );
    }
    return this.beta.exportCsv(user.id, query);
  }
}

/** Public pages Google Play and the App Store ask for. Not part of the app's API. */
@ApiExcludeController()
@Public()
@Controller('legal')
export class LegalController {
  private readonly contact: string | undefined;

  constructor(config: ConfigService<Env, true>) {
    this.contact = config.get('LEGAL_CONTACT_EMAIL', { infer: true });
  }

  @Get('privacy')
  @Header('content-type', 'text/html; charset=utf-8')
  privacy(): string {
    return privacyPage(this.contact);
  }

  @Get('delete-account')
  @Header('content-type', 'text/html; charset=utf-8')
  deleteAccount(): string {
    return deleteAccountPage(this.contact);
  }

  @Get('delete-account.js')
  @Header('content-type', 'text/javascript; charset=utf-8')
  deleteAccountScript(): string {
    return DELETE_ACCOUNT_SCRIPT;
  }
}

/** Weekly retention for the beta (ADR 017), behind ADMIN_TOKEN. */
@ApiExcludeController()
@Public()
@SkipThrottle()
@Controller('admin')
export class AdminController {
  private readonly token: Buffer | null;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    const token = config.get('ADMIN_TOKEN', { infer: true });
    this.token = token ? Buffer.from(token) : null;
  }

  @Get('retention')
  async retention(@Headers('x-admin-token') given: string | undefined): Promise<{
    users: number;
    weeklyActive: { week: string; users: number }[];
    cohorts: RetentionCohort[];
  }> {
    if (!this.token) throw new NotFoundException();
    const candidate = Buffer.from(given ?? '');
    if (candidate.length !== this.token.length || !timingSafeEqual(candidate, this.token)) {
      throw new UnauthorizedException();
    }
    const since = new Date(Date.now() - 12 * 7 * 86_400_000);
    const [users, activity] = await Promise.all([
      this.prisma.user.findMany({ select: { id: true, createdAt: true } }),
      this.prisma.activityDay.findMany({
        where: { day: { gte: since } },
        select: { userId: true, day: true },
      }),
    ]);
    const today = formatIsoDate(todayInArt());
    const days = activity.map((a) => ({ userId: a.userId, day: a.day.toISOString().slice(0, 10) }));
    const cohorts = weeklyRetention(
      users
        .filter((u) => u.createdAt >= since)
        .map((u) => ({ id: u.id, signupDay: formatIsoDate(todayInArt(u.createdAt)) })),
      days,
      today,
    );
    const byWeek = new Map<string, Set<string>>();
    for (const d of days) {
      const week = mondayOf(d.day);
      byWeek.set(week, (byWeek.get(week) ?? new Set()).add(d.userId));
    }
    return {
      users: users.length,
      weeklyActive: [...byWeek.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, ids]) => ({ week, users: ids.size })),
      cohorts,
    };
  }
}
