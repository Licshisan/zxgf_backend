import { Module } from '@nestjs/common';
import { LlmProviderRegistry } from './llm-provider.registry';
import { MockLlmProvider } from './providers/mock.provider';
import { OpenAILlmProvider } from './providers/openai.provider';

@Module({
  providers: [LlmProviderRegistry, MockLlmProvider, OpenAILlmProvider],
  exports: [LlmProviderRegistry],
})
export class LlmModule {}
