import { Body, Controller, Post, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { EventType, type AGUIEvent, type RunAgentInput } from '@ag-ui/core';
import type { Response } from 'express';
import { ChatService } from './chat.service';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('stream')
  @ApiOperation({
    summary: 'AG-UI streaming chat',
    description:
      'Accepts AG-UI RunAgentInput and returns AG-UI events over SSE.',
  })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({ description: 'Returns AG-UI Server-Sent Events stream' })
  async stream(
    @Body() body: Partial<RunAgentInput>,
    @Res({ passthrough: true }) response: Response,
  ) {
    console.log(body);
    const abortController = new AbortController();

    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    const onClientClose = () => {
      abortController.abort();
    };
    response.on('close', onClientClose);

    try {
      for await (const event of this.chatService.runAgent(
        body,
        abortController.signal,
      )) {
        if (response.destroyed || abortController.signal.aborted) {
          break;
        }
        this.writeSseEvent(response, event);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'AG-UI stream failed';
      const errorEvent: AGUIEvent = {
        type: EventType.RUN_ERROR,
        message: errMsg,
        code: 'CHAT_STREAM_FAILED',
        timestamp: Date.now(),
      };

      if (!response.destroyed) {
        this.writeSseEvent(response, errorEvent);
      }
    } finally {
      response.off('close', onClientClose);
      if (!response.destroyed) {
        response.end();
      }
    }
  }

  private writeSseEvent(response: Response, event: AGUIEvent): void {
    response.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}
