import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import {
  DocumentChunkService,
  type TextChunk,
} from './documents/document-chunk.service';
import type { ImportDocumentDto } from './dto/import-document.dto';
import type { SearchRagDto } from './dto/search-rag.dto';
import { EmbeddingProviderRegistry } from './embeddings/embedding-provider.registry';

export interface UpsertChunkInput {
  sourceId: string;
  sourceTitle?: string;
  chunkIndex: number;
  content: string;
  metadata?: Record<string, unknown>;
  embedding: number[];
}

export interface RagSearchResult {
  id: number;
  sourceId: string;
  sourceTitle: string | null;
  chunkIndex: number;
  content: string;
  metadata: unknown;
  distance: number;
  score: number;
}

@Injectable()
export class RagService {
  constructor(
    private readonly chunkService: DocumentChunkService,
    private readonly embeddingProvider: EmbeddingProviderRegistry,
    private readonly prisma: PrismaService,
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

    await this.replaceSourceChunks(
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
    const results = await this.searchVectorStore({
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

  private async replaceSourceChunks(
    sourceId: string,
    chunks: UpsertChunkInput[],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM document_chunks
        WHERE source_id = ${sourceId}
      `;

      for (const chunk of chunks) {
        const metadataJson = chunk.metadata
          ? JSON.stringify(chunk.metadata)
          : null;

        await tx.$executeRaw`
        INSERT INTO document_chunks (
          source_id,
          source_title,
          chunk_index,
          content,
          metadata,
          embedding
        )
        VALUES (
          ${chunk.sourceId},
          ${chunk.sourceTitle ?? null},
          ${chunk.chunkIndex},
          ${chunk.content},
          ${metadataJson}::jsonb,
          ${this.toVectorLiteral(chunk.embedding)}::vector
        )
      `;
      }
    });
  }

  private searchVectorStore(input: {
    embedding: number[];
    topK: number;
    sourceId?: string;
    filters?: Record<string, unknown>;
  }): Promise<RagSearchResult[]> {
    const vector = this.toVectorLiteral(input.embedding);
    const whereParts: Prisma.Sql[] = [];

    if (input.sourceId) {
      whereParts.push(Prisma.sql`source_id = ${input.sourceId}`);
    }

    if (input.filters && Object.keys(input.filters).length > 0) {
      whereParts.push(
        Prisma.sql`metadata @> ${JSON.stringify(input.filters)}::jsonb`,
      );
    }

    const whereClause =
      whereParts.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(whereParts, ' AND ')}`
        : Prisma.empty;

    return this.prisma.$queryRaw<RagSearchResult[]>`
      SELECT
        id,
        source_id AS "sourceId",
        source_title AS "sourceTitle",
        chunk_index AS "chunkIndex",
        content,
        metadata,
        embedding <=> ${vector}::vector AS distance,
        1 - (embedding <=> ${vector}::vector) AS score
      FROM document_chunks
      ${whereClause}
      ORDER BY embedding <=> ${vector}::vector
      LIMIT ${input.topK}
    `;
  }

  private toVectorLiteral(embedding: number[]): string {
    const values = embedding.map((value) => {
      if (!Number.isFinite(value)) {
        throw new Error('Embedding contains a non-finite number');
      }
      return Number(value).toString();
    });

    return `[${values.join(',')}]`;
  }
}
