import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { type UpdateUserInput, type User } from '@findemes/shared';

import { PrismaService } from '../prisma/prisma.service.js';
import { toUserDto } from './user.dto.js';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly prisma: PrismaService) {}

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
    await this.prisma.$transaction([
      this.prisma.loginCode.deleteMany({ where: { email: user.email } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);
    this.logger.log('account.deleted');
  }
}
