import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { toOpenAIChatMessages } from '../adapters/chat.adapter';
import type {
  ChatProvider,
  ChatProviderEvent,
  ChatProviderInput,
  ChatProviderName,
} from './chat-provider.interface';

@Injectable()
export class OpenAIChatProvider implements ChatProvider {
  readonly name: ChatProviderName = 'openai';

  constructor(private readonly config: ConfigService) {}

  async *streamChat(
    input: ChatProviderInput,
  ): AsyncGenerator<ChatProviderEvent> {
    if (input.signal.aborted) return;

    const messages = toOpenAIChatMessages(input.messages);
    if (messages.length === 0) {
      throw new Error('未提供可用于对话的文本消息');
    }

    const apiKey = this.config.get<string>('LLM_API_KEY')?.trim();
    if (!apiKey) {
      throw new Error('缺少必需的 LLM_API_KEY 配置');
    }

    const baseURL = this.config.get<string>('LLM_BASE_URL')
    const model = input.options.model || this.config.get<string>('LLM_MODEL')!
    const client = new OpenAI({ apiKey, baseURL });

    console.log(messages)
    try {
      const stream = await client.chat.completions.create(
        {
          model,
          messages,
          stream: true,
          temperature: input.options.temperature,
        },
        { signal: input.signal },
      );

      for await (const chunk of stream) {
        if (input.signal.aborted) return;
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yield { type: 'text-delta', delta };
        }
      }
    } catch (err) {
      console.error('OpenAIChatProvider streamChat error:', err);
      if ( input.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        return;
      }
      throw err;
    }
  }
}
