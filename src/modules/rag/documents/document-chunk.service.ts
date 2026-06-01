import { BadRequestException, Injectable } from '@nestjs/common';

export interface TextChunk {
  index: number;
  content: string;
}

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_OVERLAP = 150;

@Injectable()
export class DocumentChunkService {
  splitText(
    content: string,
    chunkSize = DEFAULT_CHUNK_SIZE,
    overlap = DEFAULT_OVERLAP,
  ): TextChunk[] {
    const text = content.trim();
    if (!text) {
      throw new BadRequestException('Document content cannot be empty');
    }

    if (overlap >= chunkSize) {
      throw new BadRequestException('Chunk overlap must be smaller than size');
    }

    const chunks: TextChunk[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      const chunk = text.slice(start, end).trim();

      if (chunk) {
        chunks.push({
          index: chunks.length,
          content: chunk,
        });
      }

      if (end >= text.length) break;
      start = end - overlap;
    }

    return chunks;
  }
}
