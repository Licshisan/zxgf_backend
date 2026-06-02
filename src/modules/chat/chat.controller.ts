import { Body, Controller, Post, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { type AGUIEvent, type RunAgentInput } from '@ag-ui/core';
import { AGUI_MEDIA_TYPE } from '@ag-ui/encoder';
import type { Response } from 'express';
import { StreamAgent } from './decorators/stream-agent.decorator';
import { ChatService } from './chat.service';

const CHAT_STREAM_ERROR_CODE = 'CHAT_STREAM_FAILED';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('chat')
  @ApiOperation({
    summary: 'AG-UI 大模型流式对话',
    description:
      '接收 AG-UI RunAgentInput，并通过 SSE 返回大模型 AG-UI 事件流。',
  })
  @ApiProduces('text/event-stream', AGUI_MEDIA_TYPE)
  @ApiOkResponse({ description: '返回 AG-UI Server-Sent Events 事件流' })
  @StreamAgent({ errorCode: CHAT_STREAM_ERROR_CODE })
  llmStream(
    @Body() body: Partial<RunAgentInput>,
    @Res({ passthrough: true }) response: Response,
    signal: AbortSignal,
  ): AsyncGenerator<AGUIEvent> {
    void response;
    return this.chatService.runAgent(body, signal);
  }
}
