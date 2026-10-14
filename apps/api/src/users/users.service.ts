import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type UpdateUserInput, type User } from '@findemes/shared';

import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { toUserDto } from './user.dto.js';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async getMe(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    return toUserDto(user);
  }

  async updateMe(userId: string, input: UpdateUserInput): Promise<User> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.dailyReminderTime !== undefined
          ? { dailyReminderTime: input.dailyReminderTime }
          : {}),
        ...(input.payday !== undefined ? { payday: input.payday } : {}),
        ...(input.pushAlerts !== undefined ? { pushAlerts: input.pushAlerts } : {}),
      },
    });
    return toUserDto(user);
  }

  /** Real deletion: cascades to every row the user owns; login codes have no FK, so they go explicitly. */
  async deleteMe(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException();
    const photos = await this.prisma.receipt.findMany({
      where: { userId },
      select: { imageKey: true },
    });
    await this.prisma.$transaction([
      this.prisma.loginCode.deleteMany({ where: { email: user.email } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);
    // Ticket photos live in the bucket, outside the cascade.
    for (const photo of photos) await this.storage.delete(photo.imageKey);
    this.logger.log('account.deleted');
  }
}
