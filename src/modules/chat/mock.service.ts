import { Injectable, Logger } from '@nestjs/common';
import {
  EventType,
  type AGUIEvent,
  type Message,
  type RunAgentInput,
} from '@ag-ui/core';
import { randomUUID } from 'node:crypto';

const MOCK_REPLY_PREFIX = 'This is a mock AI reply: ';
const STREAM_DELAY_MS = 120;
const CHUNK_SIZE = 12;

@Injectable()
export class MockService {
  private readonly logger = new Logger(MockService.name);

  async *runAgent(
    input: Partial<RunAgentInput>,
    signal: AbortSignal,
  ): AsyncGenerator<AGUIEvent> {
    if (signal.aborted) return;

    try {
      const startEvent: AGUIEvent = {
        type: EventType.RUN_STARTED,
        threadId: input.threadId || '123',
        runId: input.runId || 'run_id',
      };

      yield startEvent;

      const messageId = `msg_${randomUUID()}`;
      const reply = this.createMockReply(input.messages || []);

      yield {
        type: EventType.TEXT_MESSAGE_START,
        messageId,
        role: 'assistant',
        timestamp: Date.now(),
      };

      const chunks = this.splitReply(reply);
      for (const chunk of chunks) {
        if (signal.aborted) {
          this.logger.log('Stream aborted by client during content streaming');
          return;
        }

        await this.delay(STREAM_DELAY_MS, signal);

        if (signal.aborted) {
          this.logger.log('Stream aborted after delay');
          return;
        }

        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: chunk,
          timestamp: Date.now(),
        };
      }

      yield {
        type: EventType.TEXT_MESSAGE_END,
        messageId,
        timestamp: Date.now(),
      };

      yield {
        type: EventType.RUN_FINISHED,
        threadId: input.threadId || '123',
        runId: input.runId || 'run_id',
        outcome: {
          type: 'success',
        },
        timestamp: Date.now(),
      };
    } catch (err) {
      this.logger.error('AG-UI mock stream error', err);
      throw err;
    }
  }

  private createMockReply(messages: Message[]): string {
    let lastUserMessage: Message | null = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'user') {
        lastUserMessage = msg;
        break;
      }
    }

    const userText = lastUserMessage
      ? this.messageContentToText(lastUserMessage.content)
      : '';

    return `${MOCK_REPLY_PREFIX}I received your question "${userText}". You can replace this with a real model or agent stream later.`;
  }

  private messageContentToText(content: Message['content']): string {
    if (typeof content === 'string') {
      return content.trim();
    }

    if (Array.isArray(content)) {
      return content
        .map((part) => (part.type === 'text' ? part.text : `[${part.type}]`))
        .join(' ')
        .trim();
    }

    return '';
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
