import { Injectable, Logger } from '@nestjs/common';
import type { Message } from '@ag-ui/core';
import { messageContentToText } from '../llm-message.adapter';
import type {
  LlmProvider,
  LlmProviderEvent,
  LlmProviderInput,
  LlmProviderName,
} from '../llm-provider.interface';

const MOCK_REPLY_PREFIX = '这是一条模拟 AI 回复：';
const STREAM_DELAY_MS = 120;
const CHUNK_SIZE = 12;

@Injectable()
export class MockLlmProvider implements LlmProvider {
  readonly name: LlmProviderName = 'mock';
  private readonly logger = new Logger(MockLlmProvider.name);

  async *streamChat(input: LlmProviderInput): AsyncGenerator<LlmProviderEvent> {
    try {
      const reply = this.createMockReply(input.messages);
      const chunks = reply.match(new RegExp(`.{1,${CHUNK_SIZE}}`, 'gu')) ?? [];

      for (const chunk of chunks) {
        if (input.signal.aborted) {
          this.logger.log('客户端在内容流式传输期间中断了请求');
          return;
        }

        await this.waitForNextChunk(input.signal);

        if (input.signal.aborted) {
          this.logger.log('延迟后检测到流式请求已中断');
          return;
        }

        yield { type: 'text-delta', delta: chunk };
      }
    } catch (err) {
      this.logger.error('AG-UI 模拟流式响应出错', err);
      throw err;
    }
  }

  private createMockReply(messages: Message[]): string {
    let userText = '';
    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === 'user');

    if (lastUserMessage) {
      userText = messageContentToText(lastUserMessage.content);
    }

    return `${MOCK_REPLY_PREFIX}我已收到你的问题：“${userText}”。之后可以将这里替换为真实模型或智能体的流式输出。`;
  }

  private waitForNextChunk(signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }

      let timer: NodeJS.Timeout | null = setTimeout(resolve, STREAM_DELAY_MS);

      const onAbort = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        resolve();
      };

      signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}
