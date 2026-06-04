import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { type AGUIEvent } from '@ag-ui/core';
import { AGUI_MEDIA_TYPE } from '@ag-ui/encoder';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StreamAgent } from '../../common/decorators/stream-agent.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthUser } from '../../common/types/auth-user.type';
import { ChatService } from './chat.service';
import { ChatStreamDto } from './dto/chat-stream.dto';

const CHAT_STREAM_ERROR_CODE = 'CHAT_STREAM_FAILED';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('stream')
  @ApiOperation({
    summary: 'AG-UI 大模型流式对话',
    description:
      '接收带 sessionId 的 AG-UI RunAgentInput，后端加载会话历史并通过 SSE 返回 AG-UI 事件流。',
  })
  @ApiProduces('text/event-stream', AGUI_MEDIA_TYPE)
  @ApiOkResponse({ description: '返回 AG-UI Server-Sent Events 事件流' })
  @UseGuards(JwtAuthGuard)
  @StreamAgent({ errorCode: CHAT_STREAM_ERROR_CODE })
  llmStream(
    @Body() body: ChatStreamDto,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) response: Response,
    signal: AbortSignal,
  ): AsyncGenerator<AGUIEvent> {
    void response;
    return this.chatService.runAgent(body, signal, user);
  }
}
