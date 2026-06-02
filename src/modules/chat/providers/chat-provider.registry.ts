import { Injectable } from '@nestjs/common';
import { MockChatProvider } from './mock-chat.provider';
import { OpenAIChatProvider } from './openai-chat.provider';
import type { ChatProvider, ChatProviderName } from './chat-provider.interface';

@Injectable()
export class ChatProviderRegistry {
  constructor(
    private readonly mockProvider: MockChatProvider,
    private readonly openAIProvider: OpenAIChatProvider,
  ) {}

  getProvider(name: ChatProviderName = 'openai'): ChatProvider {
    switch (name) {
      case 'mock':
        return this.mockProvider;
      case 'openai':
        return this.openAIProvider;
      default:
        return this.openAIProvider;
    }
  }
}
