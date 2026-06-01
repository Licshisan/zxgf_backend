import { Injectable, Logger } from '@nestjs/common';
import type { Message } from '@ag-ui/core';
import { messageContentToText } from '../adapters/ag-ui.adapter';
import type {
  ChatProvider,
  ChatProviderEvent,
  ChatProviderInput,
  ChatProviderName,
} from './chat-provider.interface';

const MOCK_REPLY_PREFIX = 'This is a mock AI reply: ';
const STREAM_DELAY_MS = 120;
const CHUNK_SIZE = 12;

@Injectable()
export class MockChatProvider implements ChatProvider {
  readonly name: ChatProviderName = 'mock';
  private readonly logger = new Logger(MockChatProvider.name);

  async *streamChat(
    input: ChatProviderInput,
  ): AsyncGenerator<ChatProviderEvent> {
    try {
      const chunks = this.splitReply(this.createMockReply(input.messages));
      for (const chunk of chunks) {
        if (input.signal.aborted) {
          this.logger.log('Stream aborted by client during content streaming');
          return;
        }

        await this.delay(STREAM_DELAY_MS, input.signal);

        if (input.signal.aborted) {
          this.logger.log('Stream aborted after delay');
          return;
        }

        yield { type: 'text-delta', delta: chunk };
      }
    } catch (err) {
      this.logger.error('AG-UI mock stream error', err);
      throw err;
    }
  }

  private createMockReply(messages: Message[]): string {
    const lastUserMessage = [...messages]
      .reverse()
      .find((message) => message.role === 'user');
    const userText = lastUserMessage
      ? messageContentToText(lastUserMessage.content)
      : '';

    return `${MOCK_REPLY_PREFIX}I received your question "${userText}". You can replace this with a real model or agent stream later.`;
  }

  private splitReply(reply: string): string[] {
    if (!reply) return [];
    const reg = new RegExp(`.{1,${CHUNK_SIZE}}`, 'gu');
    return reply.match(reg) ?? [];
  }

  private delay(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }

      let timer: NodeJS.Timeout | null = setTimeout(resolve, ms);

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
