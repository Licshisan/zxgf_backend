export interface EmbeddingProvider {
  embedTexts(texts: string[]): Promise<number[][]>;
  embedQuery(query: string): Promise<number[]>;
}

export type EmbeddingProviderName = 'xfyun' | 'openai';
