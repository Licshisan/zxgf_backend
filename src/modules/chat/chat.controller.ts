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
import { StreamAgent } from '../../common/decorators/stream-agent.decorator';
import { LlmService } from './llm.service';
import { MockService } from './mock.service';

const CHAT_STREAM_ERROR_CODE = 'CHAT_STREAM_FAILED';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(
    private readonly mockService: MockService,
    private readonly llmService: LlmService,
  ) {}

  @Post('stream')
  @ApiOperation({
    summary: 'AG-UI 模拟流式对话',
    description: '接收 AG-UI RunAgentInput，并通过 SSE 返回模拟 AG-UI 事件流。',
  })
  @ApiProduces('text/event-stream', AGUI_MEDIA_TYPE)
  @ApiOkResponse({ description: '返回 AG-UI Server-Sent Events 事件流' })
  @StreamAgent({ errorCode: CHAT_STREAM_ERROR_CODE })
  async stream(
    @Body() body: Partial<RunAgentInput>,
    @Res({ passthrough: true }) response: Response,
    signal: AbortSignal,
  ): Promise<AsyncGenerator<AGUIEvent>> {
    void response;
    return this.mockService.runAgent(body, signal);
  }

  @Post('llm/stream')
  @ApiOperation({
    summary: 'AG-UI 大模型流式对话',
    description: '接收 AG-UI RunAgentInput，并通过 SSE 返回大模型 AG-UI 事件流。',
  })
  @ApiProduces('text/event-stream', AGUI_MEDIA_TYPE)
  @ApiOkResponse({ description: '返回 AG-UI Server-Sent Events 事件流' })
  @StreamAgent({ errorCode: CHAT_STREAM_ERROR_CODE })
  async llmStream(
    @Body() body: Partial<RunAgentInput>,
    @Res({ passthrough: true }) response: Response,
    signal: AbortSignal,
  ): Promise<AsyncGenerator<AGUIEvent>> {
    void response;
    return this.llmService.runAgent(body, signal);
  }
}
