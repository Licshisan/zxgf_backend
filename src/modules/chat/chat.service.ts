import { Injectable } from '@nestjs/common';

const MOCK_REPLY_PREFIX = '这是一个测试 AI 回复：';
const STREAM_DELAY_MS = 120;

@Injectable()
export class ChatService {
  async *createMockStream(message: string, signal: AbortSignal) {
    yield {
      type: 'start',
    };

    const reply = `${MOCK_REPLY_PREFIX}我已经收到你的问题「${message}」。后续可以在这里接入真实大模型流式输出。`;

    for (const chunk of this.splitReply(reply)) {
      if (signal.aborted) {
        return;
      }

      await this.delay(STREAM_DELAY_MS, signal);

      if (signal.aborted) {
        return;
      }

      yield {
        type: 'delta',
        content: chunk,
      };
    }

    yield {
      type: 'done',
    };
  }

  private splitReply(reply: string) {
    return reply.match(/.{1,6}/gu) ?? [];
  }

  private delay(ms: number, signal: AbortSignal) {
    return new Promise<void>((resolve) => {
      if (signal.aborted) {
        resolve();
        return;
      }

      const timer = setTimeout(resolve, ms);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
  }
}
