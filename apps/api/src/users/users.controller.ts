import { Body, Controller, Delete, Get, HttpCode, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UpdateUserSchema, type User, UserSchema } from '@findemes/shared';
import { type z } from 'zod';

import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'The signed-in user' })
  @ApiOkResponse({ standardSchema: UserSchema })
  me(@CurrentUser() user: AuthUser): Promise<User> {
    return this.users.getMe(user.id);
  }

  @Patch()
  @ApiOperation({ summary: 'Update name or daily reminder time (null turns it off)' })
  @ApiOkResponse({ standardSchema: UserSchema })
  update(
    @CurrentUser() user: AuthUser,
    @Body({ schema: UpdateUserSchema }) body: z.output<typeof UpdateUserSchema>,
  ): Promise<User> {
    return this.users.updateMe(user.id, body);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete the account and everything it owns' })
  async remove(@CurrentUser() user: AuthUser): Promise<void> {
    await this.users.deleteMe(user.id);
  }
}
