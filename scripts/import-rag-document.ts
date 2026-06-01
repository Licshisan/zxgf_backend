import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { RagModule } from '../src/modules/rag/rag.module';
import { RagService } from '../src/modules/rag/rag.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    RagModule,
  ],
})
class RagImportModule {}

interface CliOptions {
  file: string;
  sourceId?: string;
  title?: string;
  metadata?: Record<string, unknown>;
  chunkSize?: number;
  overlap?: number;
}

function parseArgs(argv: string[]): CliOptions {
  const options: Partial<CliOptions> = {};

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const next = argv[index + 1];

    switch (arg) {
      case '--file':
        options.file = next;
        index++;
        break;
      case '--source-id':
        options.sourceId = next;
        index++;
        break;
      case '--title':
        options.title = next;
        index++;
        break;
      case '--metadata':
        options.metadata = JSON.parse(next) as Record<string, unknown>;
        index++;
        break;
      case '--chunk-size':
        options.chunkSize = Number(next);
        index++;
        break;
      case '--overlap':
        options.overlap = Number(next);
        index++;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.file) {
    throw new Error(
      'Missing --file. Example: npm run rag:import -- --file ./docs/example.md --source-id example',
    );
  }

  return options as CliOptions;
}

async function bootstrap() {
  const options = parseArgs(process.argv.slice(2));
  const filePath = resolve(options.file);
  const content = await readFile(filePath, 'utf8');

  const app = await NestFactory.createApplicationContext(RagImportModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const ragService = app.get(RagService);
    const result = await ragService.importDocument({
      sourceId: options.sourceId ?? basename(filePath),
      sourceTitle: options.title ?? basename(filePath),
      content,
      metadata: {
        ...(options.metadata ?? {}),
        filePath,
      },
      chunkSize: options.chunkSize,
      overlap: options.overlap,
    });

    console.log(
      `Imported ${result.chunkCount} chunks for source ${result.sourceId}`,
    );
  } finally {
    await app.close();
  }
}

bootstrap().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
