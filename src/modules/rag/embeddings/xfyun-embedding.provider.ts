import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmbeddingProvider } from './embedding-provider.interface';

const EMBEDDING_DIMENSION = 1024;
const EMBEDDING_PATH = '/embeddings';

interface XfyunEmbeddingResponse {
  data?: Array<{
    embedding?: number[];
  }>;
}

@Injectable()
export class XfyunEmbeddingProvider implements EmbeddingProvider {
  constructor(private readonly config: ConfigService) {}

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const apiKey = this.config.get<string>('EMBEDDING_API_KEY')?.trim();
    const baseUrl = this.config
      .get<string>('EMBEDDING_BASE_URL')
      ?.trim()
      .replace(/\/+$/, '');
    const model = this.config.get<string>('EMBEDDING_MODEL')?.trim();

    if (!apiKey || !baseUrl || !model) {
      throw new Error(
        'EMBEDDING_API_KEY, EMBEDDING_BASE_URL and EMBEDDING_MODEL are required',
      );
    }

    const response = await fetch(`${baseUrl}${EMBEDDING_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: texts,
        dimensions: EMBEDDING_DIMENSION,
      }),
    });

    const payload = (await response.json()) as XfyunEmbeddingResponse;
    if (!response.ok) {
      throw new Error(`Embedding request failed: ${JSON.stringify(payload)}`);
    }

    return (payload.data ?? []).map((item) =>
      this.assertEmbedding(item.embedding ?? []),
    );
  }

  async embedQuery(query: string): Promise<number[]> {
    const [embedding] = await this.embedTexts([query]);
    return embedding;
  }

  private assertEmbedding(embedding: number[]): number[] {
    if (embedding.length !== EMBEDDING_DIMENSION) {
      throw new Error(
        `Embedding dimension mismatch: expected ${EMBEDDING_DIMENSION}, got ${embedding.length}`,
      );
    }

    const hasNonZero = embedding.some((value) => value !== 0);
    if (!hasNonZero) {
      throw new Error('Embedding is all zeros');
    }

    return embedding;
  }
}
