import { Injectable } from '@nestjs/common';
import type { LlmProvider, LlmProviderName } from './llm-provider.interface';
import { MockLlmProvider } from './providers/mock.provider';
import { OpenAILlmProvider } from './providers/openai.provider';

@Injectable()
export class LlmProviderRegistry {
  constructor(
    private readonly mockProvider: MockLlmProvider,
    private readonly openAIProvider: OpenAILlmProvider,
  ) {}

  getProvider(name: LlmProviderName = 'openai'): LlmProvider {
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
