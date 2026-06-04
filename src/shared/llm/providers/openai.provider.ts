import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { toOpenAIChatMessages } from '../llm-message.adapter';
import type {
  LlmProvider,
  LlmProviderEvent,
  LlmProviderInput,
  LlmProviderName,
} from '../llm-provider.interface';

@Injectable()
export class OpenAILlmProvider implements LlmProvider {
  readonly name: LlmProviderName = 'openai';

  constructor(private readonly config: ConfigService) {}

  async *streamChat(input: LlmProviderInput): AsyncGenerator<LlmProviderEvent> {
    if (input.signal.aborted) return;

    const messages = toOpenAIChatMessages(input.messages);
    if (messages.length === 0) {
      throw new Error('未提供可用于对话的文本消息');
    }

    const apiKey = this.config.get<string>('LLM_API_KEY')?.trim();
    if (!apiKey) {
      throw new Error('缺少必需的 LLM_API_KEY 配置');
    }

    const baseURL = this.config.get<string>('LLM_BASE_URL');
    const model = input.options.model || this.config.get<string>('LLM_MODEL')!;
    const client = new OpenAI({ apiKey, baseURL });

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
      if (
        input.signal.aborted ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        return;
      }
      throw err;
    }
  }
}
