import { Injectable } from '@nestjs/common';
import {
  DocumentChunkService,
  type TextChunk,
} from './documents/document-chunk.service';
import type { ImportDocumentDto } from './dto/import-document.dto';
import type { SearchRagDto } from './dto/search-rag.dto';
import { EmbeddingProviderRegistry } from './embeddings/embedding-provider.registry';
import { VectorStoreService } from './vector-store/vector-store.service';

@Injectable()
export class RagService {
  constructor(
    private readonly chunkService: DocumentChunkService,
    private readonly embeddingProvider: EmbeddingProviderRegistry,
    private readonly vectorStore: VectorStoreService,
  ) {}

  async importDocument(dto: ImportDocumentDto) {
    let chunks: TextChunk[];

    if (dto.chunkStrategy === 'markdown') {
      chunks = this.chunkService.splitMarkdown(dto.content, {
        chunkSize: dto.chunkSize,
        overlap: dto.overlap,
        contextTitle: dto.chunkContextTitle,
      });
    } else {
      chunks = this.chunkService.splitText(
        dto.content,
        dto.chunkSize,
        dto.overlap,
      );
    }

    const embeddings = await this.embeddingProvider.embedTexts(
      chunks.map((chunk) => chunk.content),
    );

    await this.vectorStore.replaceSourceChunks(
      dto.sourceId,
      chunks.map((chunk, index) => ({
        sourceId: dto.sourceId,
        sourceTitle: dto.sourceTitle,
        chunkIndex: chunk.index,
        content: chunk.content,
        metadata: {
          ...(dto.metadata ?? {}),
          ...(chunk.metadata ?? {}),
          chunkLength: chunk.content.length,
        },
        embedding: embeddings[index],
      })),
    );

    return {
      sourceId: dto.sourceId,
      sourceTitle: dto.sourceTitle ?? null,
      chunkCount: chunks.length,
    };
  }

  async search(dto: SearchRagDto) {
    const embedding = await this.embeddingProvider.embedQuery(dto.query);
    const results = await this.vectorStore.search({
      embedding,
      topK: dto.topK ?? 5,
      sourceId: dto.sourceId,
      filters: dto.filters,
    });
    const minScore = dto.minScore ?? 0;
    const filteredResults = results.filter(
      (result) => result.score >= minScore,
    );

    return {
      query: dto.query,
      topK: dto.topK ?? 5,
      minScore,
      results: filteredResults,
    };
  }
}
