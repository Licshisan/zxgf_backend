import { Injectable } from '@nestjs/common';
import { DocumentChunkService } from './documents/document-chunk.service';
import type { ImportDocumentDto } from './dto/import-document.dto';
import type { SearchRagDto } from './dto/search-rag.dto';
import { OpenAIEmbeddingProvider } from './embeddings/openai-embedding.provider';
import { VectorStoreService } from './vector-store/vector-store.service';

@Injectable()
export class RagService {
  constructor(
    private readonly chunkService: DocumentChunkService,
    private readonly embeddingProvider: OpenAIEmbeddingProvider,
    private readonly vectorStore: VectorStoreService,
  ) {}

  async importDocument(dto: ImportDocumentDto) {
    const chunks = this.chunkService.splitText(
      dto.content,
      dto.chunkSize,
      dto.overlap,
    );
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

    return {
      query: dto.query,
      topK: dto.topK ?? 5,
      results,
    };
  }
}
