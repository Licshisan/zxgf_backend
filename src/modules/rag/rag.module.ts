import { Module } from '@nestjs/common';
import { PrismaModule } from '../../shared/prisma/prisma.module';
import { DocumentChunkService } from './documents/document-chunk.service';
import { OpenAIEmbeddingProvider } from './embeddings/openai-embedding.provider';
import { RagService } from './rag.service';
import { VectorStoreService } from './vector-store/vector-store.service';

@Module({
  imports: [PrismaModule],
  providers: [
    RagService,
    DocumentChunkService,
    OpenAIEmbeddingProvider,
    VectorStoreService,
  ],
  exports: [RagService],
})
export class RagModule {}
