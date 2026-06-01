import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ChatService } from './chat.service';
import { ChatStreamDto } from './dto/chat-stream.dto';

@ApiTags('聊天')
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('stream')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: '流式聊天测试',
    description: '返回 SSE 流式数据，用于测试前端打字机效果。',
  })
  @ApiBody({ type: ChatStreamDto })
  @ApiProduces('text/event-stream')
  @ApiOkResponse({ description: '返回 text/event-stream 流式响应' })
  @ApiUnauthorizedResponse({ description: '未登录或令牌无效' })
  async stream(@Body() dto: ChatStreamDto, @Res() response: Response) {
    const abortController = new AbortController();

    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    response.on('close', () => {
      abortController.abort();
    });

    try {
      for await (const event of this.chatService.createMockStream(
        dto.message,
        abortController.signal,
      )) {
        if (response.destroyed || abortController.signal.aborted) {
          return;
        }

        response.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      if (!response.destroyed) {
        response.write(
          `data: ${JSON.stringify({
            type: 'error',
            message: '流式响应失败',
          })}\n\n`,
        );
      }
    } finally {
      if (!response.destroyed) {
        response.end();
      }
    }
  }
}
