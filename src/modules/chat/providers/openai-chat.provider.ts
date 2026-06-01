import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { toOpenAIChatMessages } from '../adapters/openai-message.adapter';
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
      throw new Error('No text chat messages were provided');
    }

    try {
      const stream = await this.createClient().chat.completions.create(
        {
          model: this.getModel(input.options.model),
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
      if (input.signal.aborted || this.isAbortError(err)) {
        return;
      }

      throw err;
    }
  }

  private createClient(): OpenAI {
    return new OpenAI({
      apiKey: this.getApiKey(),
      baseURL: this.getBaseUrl(),
    });
  }

  private getBaseUrl(): string {
    const baseUrl =
      this.config.get<string>('LLM_BASE_URL') ??
      this.config.get<string>('OPENAI_BASE_URL') ??
      'https://api.openai.com/v1';

    return baseUrl.trim().replace(/\/+$/, '');
  }

  private getApiKey(): string {
    const apiKey =
      this.config.get<string>('LLM_API_KEY') ??
      this.config.get<string>('OPENAI_API_KEY');

    if (!apiKey?.trim()) {
      throw new Error('LLM_API_KEY is required');
    }

    return apiKey.trim();
  }

  private getModel(requestedModel?: string): string {
    const model =
      requestedModel ??
      this.config.get<string>('LLM_MODEL') ??
      this.config.get<string>('OPENAI_MODEL') ??
      'gpt-4o-mini';

    return model.trim() || 'gpt-4o-mini';
  }

  private isAbortError(err: unknown): boolean {
    return err instanceof Error && err.name === 'AbortError';
  }
}
