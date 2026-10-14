import { Controller, Delete, Get, HttpCode, Param, ParseEnumPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ChatChannel, type ChatLink, ChatLinkSchema } from '@findemes/shared';

import { type AuthUser, CurrentUser } from '../auth/current-user.decorator.js';
import { ChatLinkService } from './chat-link.service.js';

@ApiTags('chat')
@ApiBearerAuth()
@Controller('me/chats')
export class ChatLinkController {
  constructor(private readonly links: ChatLinkService) {}

  /** Which chats are available and linked, and how to link the others. */
  @Get()
  @ApiOkResponse({ standardSchema: ChatLinkSchema })
  status(@CurrentUser() user: AuthUser): Promise<ChatLink> {
    return this.links.status(user.id);
  }

  @Delete(':channel')
  @HttpCode(204)
  async unlink(
    @CurrentUser() user: AuthUser,
    @Param('channel', new ParseEnumPipe(ChatChannel.enum)) channel: ChatChannel,
  ): Promise<void> {
    await this.links.unlink(user.id, channel);
  }
}
