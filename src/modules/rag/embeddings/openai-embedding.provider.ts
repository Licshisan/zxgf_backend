import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

const EMBEDDING_DIMENSION = 1024;

@Injectable()
export class OpenAIEmbeddingProvider {
  constructor(private readonly config: ConfigService) {}

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await this.createClient().embeddings.create({
      model: this.getModel(),
      input: texts,
    });

    return response.data.map((item) => this.assertDimension(item.embedding));
  }

  async embedQuery(query: string): Promise<number[]> {
    const [embedding] = await this.embedTexts([query]);
    return embedding;
  }

  private createClient(): OpenAI {
    return new OpenAI({
      apiKey: this.getApiKey(),
      baseURL: this.getBaseUrl(),
    });
  }

  private getBaseUrl(): string {
    const baseUrl =
      this.config.get<string>('EMBEDDING_BASE_URL') ??
      this.config.get<string>('LLM_BASE_URL') ??
      this.config.get<string>('OPENAI_BASE_URL') ??
      'https://api.openai.com/v1';

    return baseUrl.trim().replace(/\/+$/, '');
  }

  private getApiKey(): string {
    const apiKey =
      this.config.get<string>('EMBEDDING_API_KEY') ??
      this.config.get<string>('LLM_API_KEY') ??
      this.config.get<string>('OPENAI_API_KEY');

    if (!apiKey?.trim()) {
      throw new Error('EMBEDDING_API_KEY is required');
    }

    return apiKey.trim();
  }

  private getModel(): string {
    const model =
      this.config.get<string>('EMBEDDING_MODEL') ?? 'text-embedding-3-small';
    return model.trim() || 'text-embedding-3-small';
  }

  private assertDimension(embedding: number[]): number[] {
    if (embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(
        `Embedding dimension mismatch: expected ${EMBEDDING_DIMENSION}, got ${embedding.length}`,
      );
    }

    return embedding;
  }
}
