import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { RagModule } from '../src/modules/rag/rag.module';
import { RagService } from '../src/modules/rag/rag.service';

interface CliOptions {
  query: string;
  topK: number;
  minScore: number;
  sourceId?: string;
  filters?: Record<string, unknown>;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    RagModule,
  ],
})
class RagRetrievalTestModule {}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    query: '什么是计算机操作系统？',
    topK: 3,
    minScore: 0.5,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case '--query':
      case '-q':
        options.query = next;
        index++;
        break;
      case '--top-k':
      case '-k':
        options.topK = Number(next);
        index++;
        break;
      case '--min-score':
      case '-s':
        options.minScore = Number(next);
        index++;
        break;
      case '--source-id':
        options.sourceId = next;
        index++;
        break;
      case '--filter':
        options.filters = {
          ...(options.filters ?? {}),
          ...parseFilter(next),
        };
        index++;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.query?.trim()) {
    throw new Error('Missing --query');
  }

  if (!Number.isInteger(options.topK) || options.topK < 1) {
    throw new Error('--top-k must be a positive integer');
  }

  if (!Number.isFinite(options.minScore) || options.minScore < 0) {
    throw new Error('--min-score must be a non-negative number');
  }

  return options;
}

function parseFilter(value: string): Record<string, string> {
  const separatorIndex = value.indexOf('=');
  if (separatorIndex <= 0) {
    throw new Error('--filter must use key=value format');
  }

  return {
    [value.slice(0, separatorIndex)]: value.slice(separatorIndex + 1),
  };
}

async function bootstrap() {
  const options = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(
    RagRetrievalTestModule,
    {
      logger: ['error', 'warn'],
    },
  );

  try {
    const ragService = app.get(RagService);
    const response = await ragService.search({
      query: options.query,
      topK: options.topK,
      minScore: options.minScore,
      sourceId: options.sourceId,
      filters: options.filters,
    });

    console.log(
      JSON.stringify(
        {
          query: response.query,
          topK: response.topK,
          minScore: response.minScore,
          sourceId: options.sourceId ?? null,
          filters: options.filters ?? null,
          resultCount: response.results.length,
        },
        null,
        2,
      ),
    );

    if (response.results.length === 0) {
      console.log('No reliable retrieval result above minScore.');
      return;
    }

    for (const [index, result] of response.results.entries()) {
      const metadata = result.metadata as Record<string, unknown> | null;
      console.log(
        [
          `\n#${index + 1}`,
          `score=${result.score.toFixed(6)}`,
          `source=${result.sourceId}`,
          `chunk=${result.chunkIndex}`,
          `heading=${String(metadata?.markdownHeading ?? '')}`,
          result.content,
        ].join('\n'),
      );
    }
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
