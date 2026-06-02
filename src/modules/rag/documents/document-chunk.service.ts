import { BadRequestException, Injectable } from '@nestjs/common';

export interface TextChunk {
  index: number;
  content: string;
  metadata?: Record<string, unknown>;
}

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_OVERLAP = 150;
const DEFAULT_MARKDOWN_CHUNK_SIZE = 1600;

interface MarkdownBlock {
  headingPath: string[];
  content: string;
}

export interface MarkdownSplitOptions {
  chunkSize?: number;
  overlap?: number;
  contextTitle?: string;
}

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

  splitMarkdown(
    content: string,
    options: MarkdownSplitOptions = {},
  ): TextChunk[] {
    const text = content.trim();
    if (!text) {
      throw new BadRequestException('Document content cannot be empty');
    }

    const chunkSize = options.chunkSize ?? DEFAULT_MARKDOWN_CHUNK_SIZE;
    const overlap = options.overlap ?? DEFAULT_OVERLAP;
    if (overlap >= chunkSize) {
      throw new BadRequestException('Chunk overlap must be smaller than size');
    }

    const blocks = this.parseMarkdownBlocks(text);
    if (blocks.length === 0) {
      return this.splitText(text, chunkSize, overlap);
    }

    const chunks: TextChunk[] = [];
    let group: MarkdownBlock[] = [];

    const flushGroup = () => {
      if (group.length === 0) return;

      const headingPath = group[group.length - 1].headingPath;
      const body = group
        .map((block) => block.content)
        .join('\n\n')
        .trim();
      this.pushMarkdownChunk(chunks, body, headingPath, options.contextTitle);
      group = [];
    };

    for (const block of blocks) {
      const currentBody = group.map((item) => item.content).join('\n\n');
      const nextBody = [currentBody, block.content]
        .filter(Boolean)
        .join('\n\n');
      const headingChanged =
        group.length > 0 &&
        group[group.length - 1].headingPath.join('\u0000') !==
          block.headingPath.join('\u0000');

      if (headingChanged || (group.length > 0 && nextBody.length > chunkSize)) {
        flushGroup();
      }

      if (block.content.length > chunkSize) {
        const textChunks = this.splitText(block.content, chunkSize, overlap);
        for (const chunk of textChunks) {
          this.pushMarkdownChunk(
            chunks,
            chunk.content,
            block.headingPath,
            options.contextTitle,
          );
        }
        continue;
      }

      group.push(block);
    }

    flushGroup();
    return chunks;
  }

  private parseMarkdownBlocks(text: string): MarkdownBlock[] {
    const blocks: MarkdownBlock[] = [];
    const headingPath: string[] = [];
    const paragraph: string[] = [];

    const flushParagraph = () => {
      const content = paragraph.join('\n').trim();
      if (content) {
        blocks.push({
          headingPath: [...headingPath],
          content,
        });
      }
      paragraph.length = 0;
    };

    for (const line of text.split(/\r?\n/)) {
      const heading = /^(#{1,6})\s+(.+)$/.exec(line.trim());
      if (heading) {
        flushParagraph();
        const level = heading[1].length;
        headingPath.length = level - 1;
        headingPath[level - 1] = heading[2].trim();
        continue;
      }

      if (line.trim()) {
        paragraph.push(line);
      } else {
        flushParagraph();
      }
    }

    flushParagraph();
    return blocks;
  }

  private pushMarkdownChunk(
    chunks: TextChunk[],
    body: string,
    headingPath: string[],
    contextTitle?: string,
  ) {
    const contextHeadingPath =
      contextTitle && headingPath[0] && contextTitle.includes(headingPath[0])
        ? headingPath.slice(1)
        : headingPath;
    const context = [contextTitle, ...contextHeadingPath]
      .filter((item): item is string => Boolean(item?.trim()))
      .join(' > ');
    const content = [context ? `上下文：${context}` : '', body]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    if (!content) return;

    chunks.push({
      index: chunks.length,
      content,
      metadata: {
        markdownHeading: headingPath.at(-1) ?? null,
        markdownHeadingPath: headingPath,
      },
    });
  }
}
