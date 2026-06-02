import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  EmbeddingProvider,
  EmbeddingProviderName,
} from './embedding-provider.interface';
import { OpenAIEmbeddingProvider } from './openai-embedding.provider';
import { XfyunEmbeddingProvider } from './xfyun-embedding.provider';

@Injectable()
export class EmbeddingProviderRegistry implements EmbeddingProvider {
  constructor(
    private readonly config: ConfigService,
    private readonly xfyunProvider: XfyunEmbeddingProvider,
    private readonly openAIProvider: OpenAIEmbeddingProvider,
  ) {}

  getDefaultProvider(): EmbeddingProvider {
    const name =
      this.config.get<EmbeddingProviderName>('EMBEDDING_PROVIDER_NAME') ??
      'xfyun';

    return this.getProvider(name);
  }

  embedTexts(texts: string[]): Promise<number[][]> {
    return this.getDefaultProvider().embedTexts(texts);
  }

  embedQuery(query: string): Promise<number[]> {
    return this.getDefaultProvider().embedQuery(query);
  }

  getProvider(name: EmbeddingProviderName = 'xfyun'): EmbeddingProvider {
    switch (name) {
      case 'openai':
        return this.openAIProvider;
      case 'xfyun':
      default:
        return this.xfyunProvider;
    }
  }
}
